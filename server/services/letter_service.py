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
    LetterVersion,
    OCRArtifact,
    Prisoner,
    Assignment
)
from schemas.letter import (
    LetterCreate,
    LetterUpdate,
)


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
        
        self.db.commit()
        return self.get_letter(letter.id)

    def create_letter_from_ocr(
        self, 
        image_path: str,
        ocr_text: str, 
        ocr_confidence: float, 
        ocr_blocks: Dict[str, Any],
        author_id: int, 
        prisoner_cpid: Optional[str] = None
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
        p = self.db.query(Prisoner).filter(Prisoner.cpid == prisoner_cpid).first()
        if not p:
            # Try to pull details from excel_manager if they exist there but not in DB
            resolved = excel_manager.resolve_name_from_cpid(prisoner_cpid)
            if resolved:
                p = Prisoner(
                    cpid=resolved['cpid'],
                    first_name=resolved.get('first_name'),
                    last_name=resolved.get('last_name'),
                    facility=resolved.get('facility')
                )
            else:
                # True Ghost: CPID exists neither in DB nor Excel
                p = Prisoner(
                    cpid=prisoner_cpid,
                    first_name="Unknown",
                    last_name=f"Prisoner ({prisoner_cpid})"
                )
            self.db.add(p)
            self.db.flush()

        # 2. Create Letter
        pacific_now = datetime.now(ZoneInfo("America/Los_Angeles"))
        letter = Letter(
            prisoner_cpid=prisoner_cpid,
            created_by=author_id,
            title=f"Scan {pacific_now.strftime('%m/%d %H:%M')}",
            intake_source="intake_area",
            original_file_path=image_path,
            status="scanned",
            content_format="markdown"
        )
        self.db.add(letter)
        self.db.flush() # Get the letter ID

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

        # 5. Create dates
        dates = LetterDates(letter_id=letter.id, scanned_at=pacific_now)
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

    def update_letter(self, letter_id: int, updates: LetterUpdate) -> Letter:
        letter = self.get_letter(letter_id)
        
        for field, value in updates.model_dump(exclude_unset=True).items():
            setattr(letter, field, value)
            
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
