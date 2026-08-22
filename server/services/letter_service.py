from datetime import datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc

from db.models import (
    Letter,
    LetterDates,
    LetterStatusHistory,
    LetterVersion,
    OCRArtifact,
    Prisoner,
    Assignment,
    Sponsor,
)
from schemas.letter import (
    LetterCreate,
    LetterUpdate,
)


class AmbiguousSponsorRoutingError(Exception):
    """
    Raised when a prisoner's Sponsor value can't be confidently classified
    (see classify_sponsor_name) and no routing_status_override was supplied.
    Carries the raw value so the API layer can surface it to the operator.
    """

    def __init__(self, raw_sponsor_name: Optional[str]):
        self.raw_sponsor_name = raw_sponsor_name
        super().__init__(f"Ambiguous sponsor value, needs a human decision: {raw_sponsor_name!r}")


def classify_sponsor_name(sponsor_name: Optional[str]) -> str:
    """
    Classify a roster 'Sponsor' value into one of three buckets, rather than
    trying to maintain a hardcoded, ever-growing list of every sentinel value
    the project owner has ever typed into that column:

    - "no_sponsor": blank, or starts with the "Course" sentinel (the project
      owner handling this one directly, not a real person's name) -> confidently
      routes to the admin write queue.
    - "has_sponsor": looks like a real name (title-cased, e.g. "Jane D",
      "Sam") -> confidently routes to the letter-scan/OneDrive queue.
    - "ambiguous": doesn't clearly fit either. Real examples already found in
      the live roster: "DROP", "CANX", "DROP, 26Dec2023" -- short, all-caps
      status-code-looking tokens, not names. Guessing wrong here either
      misroutes a letter toward a stale/dropped sponsor's OneDrive, or
      needlessly delays someone who has a real sponsor -- so this must be a
      human decision, not a silent default. (Also nudges toward cleaning up
      the Excel source data, since a query only fires for genuinely unclear
      entries.)
    """
    normalized = (sponsor_name or "").strip()
    if not normalized:
        return "no_sponsor"
    if normalized.lower().startswith("course"):
        return "no_sponsor"

    first_token = normalized.split(None, 1)[0].rstrip(",;:")
    if len(first_token) >= 2 and first_token.isalpha() and first_token.isupper():
        return "ambiguous"

    return "has_sponsor"


def resolve_envelope_routing_status(sponsor_name: Optional[str]) -> Optional[str]:
    """
    Maps classify_sponsor_name()'s result to the actual Letter.status value.
    Returns None for "ambiguous" -- the caller must get an explicit human
    decision (see routing_status_override on create_letter_from_ocr) rather
    than silently picking a queue.
    """
    classification = classify_sponsor_name(sponsor_name)
    if classification == "no_sponsor":
        return "queued_for_writing"
    if classification == "has_sponsor":
        return "queued_for_letter_scan"
    return None


def extract_postmark_date_guess(ocr_text: str) -> Optional[datetime]:
    """
    Best-effort extraction of a postmark date from OCR'd envelope text (e.g.
    USPS postage-meter stamps typically read like "DEC 26 2023"). Deliberately
    a guess, not a trusted value -- same discipline as everywhere else OCR is
    used in this app: it pre-fills a field for a human to confirm or correct,
    it never gets treated as ground truth on its own.
    """
    import re

    month_names = (
        "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC"
    )
    pattern = rf"\b({month_names})\s+(\d{{1,2}})[,\s]+(\d{{4}})\b"
    match = re.search(pattern, (ocr_text or "").upper())
    if not match:
        return None

    month_str, day_str, year_str = match.groups()
    try:
        return datetime.strptime(f"{month_str} {day_str} {year_str}", "%b %d %Y")
    except ValueError:
        return None


class LetterService:
    def __init__(self, db: Session):
        self.db = db

    def _query(self):
        return self.db.query(Letter).options(
            selectinload(Letter.dates),
            selectinload(Letter.versions),
            selectinload(Letter.latest_version),
            selectinload(Letter.prisoner),
            selectinload(Letter.created_by_user)
        )

    def _log_status(self, letter_id: int, status: str, changed_by: Optional[int] = None, note: Optional[str] = None) -> None:
        """
        Append-only audit trail for Letter.status -- see LetterStatusHistory's
        docstring. Called for every status Letter ever holds, including the
        first one at creation, not just later transitions -- otherwise the
        history would be missing where a letter started.
        """
        self.db.add(LetterStatusHistory(letter_id=letter_id, status=status, changed_by=changed_by, note=note))

    def get_status_history(self, letter_id: int) -> List[LetterStatusHistory]:
        return (
            self.db.query(LetterStatusHistory)
            .filter(LetterStatusHistory.letter_id == letter_id)
            .order_by(LetterStatusHistory.changed_at)
            .all()
        )

    def create_letter(self, data: LetterCreate, author_id: Optional[int] = None) -> Letter:
        letter = Letter(
            prisoner_cpid=data.prisoner_cpid,
            created_by=author_id,
            title=data.title,
            intake_source=data.intake_source,
            original_file_path=data.original_file_path,
            status=data.status,
            tags=data.tags,
            content_format=data.content_format
        )
        self.db.add(letter)
        self.db.flush()

        # Create dates record
        dates = LetterDates(letter_id=letter.id)
        if data.status == 'scanned':
             dates.scanned_at = datetime.utcnow()
        self.db.add(dates)

        self._log_status(letter.id, data.status, changed_by=author_id)

        self.db.commit()
        return self.get_letter(letter.id)

    def create_letter_from_ocr(
        self,
        image_path: str,
        ocr_text: str,
        ocr_confidence: float,
        ocr_blocks: Dict[str, Any],
        author_id: int,
        prisoner_cpid: Optional[str] = None,
        date_picked_up_po: Optional[datetime] = None,
        routing_status_override: Optional[str] = None,
        address_verified: Optional[bool] = None,
        corrected_address: Optional[str] = None,
        corrected_city: Optional[str] = None,
        corrected_state: Optional[str] = None,
        corrected_zip: Optional[str] = None,
        add_to_db: bool = True,
        add_to_print_queue: bool = False,
    ) -> Letter:
        from globals import excel_manager
        
        # 1. Resolve Prisoner via OCR Detection
        if not prisoner_cpid:
            import re
            # Pattern for CPIDs: e.g., A12345, AB1234, TEST-001
            # CDCR standard is usually 1-2 letters + 4-5 digits
            patterns = [
                r'\b[A-Z]{1,2}[0-9]{4,5}\b',  # standard CDCR (X99999)
                r'\b[A-Z]{3,4}-?[0-9]{3,4}\b', # e.g. TEST-001
            ]
            
            found_cpid = None
            for p_regex in patterns:
                matches = re.findall(p_regex, ocr_text)
                if matches:
                    for candidate in matches:
                        # Try Excel Vault first
                        resolved = excel_manager.resolve_name_from_cpid(candidate)
                        if resolved:
                            found_cpid = resolved['cpid']
                            break
                        # Then try DB
                        p = self.db.query(Prisoner).filter(Prisoner.cpid == candidate).first()
                        if p:
                            found_cpid = p.cpid
                            break
                if found_cpid:
                    break
            
            if found_cpid:
                prisoner_cpid = found_cpid
            else:
                # Fallback to first prisoner if absolutely none detected
                default_p = self.db.query(Prisoner).first()
                if default_p:
                    prisoner_cpid = default_p.cpid
                else:
                    raise ValueError("No prisoners found in database. Please run check_db.py or upload an Excel map.")

        # --- ENSURE PRISONER EXISTS IN DB (Ghost Provisioning) ---
        # add_to_db (added 22Aug2026) is an explicit staff choice, not
        # automatic -- someone who only wrote in asking for literature isn't
        # a sponsee, and this used to silently create a full roster record
        # for them regardless. A Letter still needs *some* Prisoner row to
        # attach to (NOT NULL FK), so add_to_db=False still creates one, but
        # deliberately minimal (name/CDCR# only -- no address, facility, or
        # sponsor_name) and flagged literature_only for reporting.
        p = self.db.query(Prisoner).filter(Prisoner.cpid == prisoner_cpid).first()
        if not p:
            resolved = excel_manager.resolve_name_from_cpid(prisoner_cpid) if add_to_db else None
            if resolved:
                p = Prisoner(
                    cpid=resolved['cpid'],
                    first_name=resolved.get('first_name'),
                    last_name=resolved.get('last_name'),
                    facility=resolved.get('facility'),
                    sponsor_name=resolved.get('sponsor_name'),
                )
            elif add_to_db:
                # True Ghost: CPID exists neither in DB nor Excel
                p = Prisoner(
                    cpid=prisoner_cpid,
                    first_name="Unknown",
                    last_name=f"Prisoner ({prisoner_cpid})"
                )
            else:
                # Literature-only: minimal record, explicitly not a sponsee.
                p = Prisoner(
                    cpid=prisoner_cpid,
                    first_name="Unknown",
                    last_name=f"Prisoner ({prisoner_cpid})",
                    literature_only=True,
                )
            self.db.add(p)
            self.db.flush()

        # 1b. Scan-confirm address verification (added 18Aug2026). Gated on
        # address_verified being explicitly True -- a human confirmed either
        # the on-file address as shown, or the corrected one below. Nothing
        # here is inferred from the OCR match score itself; that score is
        # only ever advisory (see MatchingService._address_score), never a
        # substitute for the human check. If address_verified is missing or
        # False, the letter still gets created below -- this step is
        # additive, not a hard gate on scan intake.
        if corrected_address or corrected_city or corrected_state or corrected_zip:
            if corrected_address:
                p.address = corrected_address
            if corrected_city:
                p.city = corrected_city
            if corrected_state:
                p.state = corrected_state
            if corrected_zip:
                p.zip = corrected_zip

        if address_verified:
            p.letter_exchange_count = (p.letter_exchange_count or 0) + 1

        # Print queue (added 18Aug2026, decoupled from address_verified
        # 22Aug2026): its own explicit staff choice now, not automatic just
        # because the address was verified -- but still requires a verified
        # address as a prerequisite, since printing an envelope for an
        # unverified address is exactly the failure mode this exists to
        # prevent. A checked box with no verification is silently ignored,
        # not an error -- the frontend disables the checkbox until
        # addressVerified, this is the backend's own enforcement of that.
        if add_to_print_queue and address_verified:
            p.queued_for_printing_at = datetime.utcnow()

        # 2. Create Letter
        # Status is the Envelope Mgt routing decision, not a generic "scanned"
        # label: no real external sponsor (blank / "Course" sentinel / brand
        # new person) -> admin write queue; a real named sponsor -> the
        # letter-scan/OneDrive queue built out in Letter Mgt.
        if routing_status_override:
            if routing_status_override not in ("queued_for_writing", "queued_for_letter_scan"):
                raise ValueError(f"Invalid routing_status_override: {routing_status_override!r}")
            routing_status = routing_status_override
        else:
            routing_status = resolve_envelope_routing_status(p.sponsor_name)
            if routing_status is None:
                # Ambiguous sponsor value (e.g. "DROP", "CANX") -- refuse to
                # guess. The caller (api/letters.py) turns this into a 409
                # asking the operator to explicitly pick a queue.
                raise AmbiguousSponsorRoutingError(p.sponsor_name)

        pacific_now = datetime.now(ZoneInfo("America/Los_Angeles"))
        letter = Letter(
            prisoner_cpid=prisoner_cpid,
            created_by=author_id,
            title=f"Scan {pacific_now.strftime('%m/%d %H:%M')}",
            intake_source="intake_area",
            original_file_path=image_path,
            status=routing_status,
            content_format="markdown"
        )
        self.db.add(letter)
        self.db.flush() # Get the letter ID

        self._log_status(letter.id, routing_status, changed_by=author_id)

        # 3. Create Artifact
        artifact = OCRArtifact(
            letter_id=letter.id,
            source_file_ref=image_path,
            text=ocr_text,
            confidence=ocr_confidence,
            blocks=ocr_blocks
        )
        self.db.add(artifact)

        # 4. Create Initial Version
        version = LetterVersion(
            letter_id=letter.id,
            content=ocr_text or "No text detected in scan.",
            content_format="markdown",
            created_by=author_id,
            version_label="v1 (OCR)"
        )
        self.db.add(version)
        self.db.flush() # Get the version ID
        
        # Link latest version ID directly (safer than relationship assignment during flush)
        letter.latest_version_id = version.id

        # 5. Create dates. postmarked_at is a best-effort OCR guess (human
        # confirms/corrects it later, same discipline as everywhere else OCR
        # is used here); picked_up_at is always a manual entry -- staff's own
        # handwritten note of when they physically grabbed it from the PO box,
        # distinct from the postal service's own postmark.
        dates = LetterDates(
            letter_id=letter.id,
            scanned_at=pacific_now,
            postmarked_at=extract_postmark_date_guess(ocr_text),
            picked_up_at=date_picked_up_po,
        )
        self.db.add(dates)

        # 6. Create Assignment (so it shows up in Inbox)
        assignment = Assignment(
            letter_id=letter.id,
            sponsor_id=author_id,
            prisoner_cpid=prisoner_cpid,
            assigned_by=author_id,
            assigned_at=datetime.utcnow(),
            notes="Automatically assigned from Intake Area scan."
        )
        self.db.add(assignment)

        self.db.commit()
        # Fresh query to return fully joined object
        return self.get_letter(letter.id)

    def get_letter(self, letter_id: int) -> Letter:
        letter = self._query().filter(Letter.id == letter_id).first()
        if not letter:
            raise ValueError(f"Letter {letter_id} not found")
        return letter

    def list_letters(
        self, 
        skip: int = 0, 
        limit: int = 100, 
        prisoner_cpid: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Letter]:
        query = self._query()
        if prisoner_cpid:
            query = query.filter(Letter.prisoner_cpid == prisoner_cpid)
        if status:
            query = query.filter(Letter.status == status)
        
        return query.order_by(desc(Letter.created_at)).offset(skip).limit(limit).all()

    def update_letter(self, letter_id: int, updates: LetterUpdate, changed_by: Optional[int] = None) -> Letter:
        letter = self.get_letter(letter_id)
        previous_status = letter.status

        changes = updates.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(letter, field, value)

        if "status" in changes and changes["status"] != previous_status:
            self._log_status(letter.id, changes["status"], changed_by=changed_by)

        self.db.commit()
        self.db.refresh(letter)
        return letter

    def add_version(self, letter_id: int, content: str, author_id: Optional[int], fmt: str = "markdown") -> Letter:
        letter = self.get_letter(letter_id)
        
        version = LetterVersion(
            letter_id=letter.id,
            content=content,
            content_format=fmt,
            created_by=author_id,
            version_label=f"v{len(letter.versions) + 1}"
        )
        self.db.add(version)
        self.db.flush()
        
        letter.latest_version_id = version.id
        self.db.commit()
        return self.get_letter(letter.id)

    def upload_redacted_to_sponsor_onedrive(
        self,
        letter_id: int,
        files: List[Tuple[str, bytes]],
        changed_by: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        The "Scan Letter" write path: takes already-redacted page image(s)
        for one letter and files them into the sponsor's OneDrive under
        Rey's existing structure -- CAL POP/...PRISONERS/{pseudonym}/{cpid}/
        exchange{N}/ -- alongside a blank reply doc for the sponsor to type
        into (see implementation_plan.md, "Letter Mgt planning").

        `files` is a list of (filename, content) for the redacted page(s) --
        a letter can span multiple pages/images. Exchange number N is the
        letter's own letter_exchange_count (Prisoner.letter_exchange_count
        at scan-confirm time) -- correct as long as no other letter for the
        same prisoner is processed between intake and this upload step,
        which holds for CalPOP's single-operator workflow.

        Raises ValueError if the prisoner's sponsor has no matching Sponsor
        record, or that Sponsor has no pseudonym set -- both required to
        resolve the OneDrive folder, and both are things Rey fixes via the
        Sponsors tab, not something this method can guess at.
        """
        from config import get_settings
        from services.storage_service import get_storage_service
        from services.artifact_docx import build_blank_reply_docx

        letter = self.get_letter(letter_id)
        prisoner = letter.prisoner
        if not prisoner or not prisoner.sponsor_name:
            raise ValueError(f"Letter {letter_id}'s prisoner has no sponsor_name assigned yet.")

        sponsor = self.db.query(Sponsor).filter(Sponsor.name == prisoner.sponsor_name).first()
        if not sponsor:
            raise ValueError(
                f"No Sponsor record found matching sponsor_name={prisoner.sponsor_name!r}. "
                "Add this sponsor in the Sponsors tab first."
            )
        if not sponsor.pseudonym:
            raise ValueError(
                f"Sponsor {sponsor.name!r} has no pseudonym set. Set one in the Sponsors tab "
                "(it must match the sponsor's existing OneDrive folder name) before uploading."
            )

        exchange_number = letter.letter_exchange_count
        if exchange_number is None:
            raise ValueError(
                f"Letter {letter_id}'s prisoner has no letter_exchange_count yet -- "
                "the address must be verified at scan-confirm before this letter can be filed."
            )

        cpid = prisoner.cpid
        folder_path = f"CAL POP/...PRISONERS/{sponsor.pseudonym}/{cpid}/exchange{exchange_number}"

        settings = get_settings()
        storage = get_storage_service(settings, self.db)
        storage.create_folder(folder_path)

        uploaded_refs = []
        for filename, content in files:
            ref = storage.upload_file(folder_path, filename, content)
            uploaded_refs.append({"filename": filename, "ref": ref})

        reply_filename = f"{cpid}_{exchange_number}_out.docx"
        reply_ref = storage.upload_file(folder_path, reply_filename, build_blank_reply_docx())

        letter.redacted_file_ref = uploaded_refs[0]["ref"] if uploaded_refs else None
        letter.status = "redacted"
        self._log_status(letter.id, "redacted", changed_by=changed_by, note=f"Uploaded to {folder_path}")
        self.db.commit()

        return {
            "folder_path": folder_path,
            "uploaded_files": uploaded_refs,
            "reply_doc": {"filename": reply_filename, "ref": reply_ref},
        }
