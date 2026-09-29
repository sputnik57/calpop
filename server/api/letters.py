import base64
import os
import uuid
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, File, UploadFile
from sqlalchemy.orm import Session

from api.deps import get_db, get_db_user
from db.models import User
from auth.dependencies import require_admin, require_admin_or_sponsor
from auth.models import UserContext
from config import get_settings
from schemas.letter import (
    LetterCreate,
    LetterJourneyUpdate,
    LetterOut,
    LetterReminderIn,
    LetterReminderOut,
    LetterScanIngest,
    LetterStatusHistoryOut,
    LetterUpdate,
    RedactedUploadRequest,
    RedactedUploadResult,
    SponsorVisitStatsOut,
    UploadDestinationPreview,
    TranslateImageRequest,
    TranslateImageResult,
    TranscribeImageResult,
    TranscribeCloudRequest,
    OverlayTranslationResult,
    TranslateLinesRequest,
    TranslateLinesCloudRequest,
    TranslateLinesResult,
    TranslationDocxRequest,
    TranslationDocxSaveRequest,
)
from services.letter_service import LetterService, AmbiguousSponsorRoutingError
from services.matching_service import MatchingService
from services.ocr_service import OCRService
from globals import excel_manager

router = APIRouter(tags=["letters"])
settings = get_settings()
ocr_service = OCRService()


def _service(db: Session) -> LetterService:
    return LetterService(db)


@router.post("", response_model=LetterOut)
def create_letter(
    payload: LetterCreate,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    return service.create_letter(payload, author_id=db_user.id)


@router.post("/scan/", response_model=LetterOut)
def ingest_scanned_letter(
    payload: LetterScanIngest,
    request: Request,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    """
    Ingest a base64 encoded image (from webcam/scantron), perform OCR,
    and create a Letter record.
    """
    user_context = getattr(request.state, "user", None)
    # Fallback to dev user if not logged in
    auth_id = None
    if user_context:
        db_user = db.query(User).filter(User.email == user_context.email).first()
        if db_user:
            auth_id = db_user.id
    
    if not auth_id:
        db_user = db.query(User).first()
        auth_id = db_user.id if db_user else 1

    print(f"DEBUG: Received scan request (Size: {len(payload.image_data)} chars)")
    try:
        # 1. Decode Image
        # Remove header like "data:image/jpeg;base64," if present
        if "," in payload.image_data:
            header, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data
            
        image_bytes = base64.b64decode(encoded)
        
        # 2. Save Image to Disk
        filename = f"{uuid.uuid4()}_{payload.filename}"
        file_path = settings.data_root / "originals" / "letters" / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(image_bytes)
            
        # 3. Perform OCR
        text, confidence, blocks = ocr_service.process_image(image_bytes)
        
        # 4. Create Letter Record
        service = _service(db)
        letter = service.create_letter_from_ocr(
            image_path=str(file_path),
            ocr_text=text,
            ocr_confidence=confidence,
            ocr_blocks=blocks,
            author_id=auth_id,
            prisoner_cpid=payload.prisoner_cpid,
            date_picked_up_po=payload.date_picked_up_po,
            routing_status_override=payload.routing_status_override,
            address_verified=payload.address_verified,
            corrected_address=payload.corrected_address,
            corrected_city=payload.corrected_city,
            corrected_state=payload.corrected_state,
            corrected_zip=payload.corrected_zip,
            add_to_db=payload.add_to_db,
            add_to_print_queue=payload.add_to_print_queue,
        )

        return letter

    except AmbiguousSponsorRoutingError as e:
        # Deliberately not a 500 -- this isn't a server error, it's "a human
        # needs to make this call." 409 (conflict) since the request can't
        # be completed as-is but can succeed if resubmitted with
        # routing_status_override set.
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Sponsor value is ambiguous, human decision required.",
                "raw_sponsor_name": e.raw_sponsor_name,
                "resubmit_with": "routing_status_override: 'queued_for_writing' or 'queued_for_letter_scan'",
            },
        )
    except Exception as e:
        print(f"Error processing scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/analyze")
def analyze_scan(
    payload: LetterScanIngest,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    """
    Perform OCR on an image and rank candidate prisoner matches without creating
    a record. Used for the Scantron confirmation flow.

    This intentionally never auto-selects a match -- OCR + fuzzy matching is
    wrong often enough (verified against real scans) that a human always has
    to pick the right candidate before a letter/envelope is filed against it.
    """
    try:
        # 1. Decode Image
        if "," in payload.image_data:
            _, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data

        image_bytes = base64.b64decode(encoded)

        # 2. Perform OCR
        text, confidence, blocks = ocr_service.process_image(image_bytes)

        # 3. Rank candidate prisoners by fuzzy match against the OCR text
        candidates = MatchingService.find_candidates(text, db, excel_manager=excel_manager, limit=5)

        return {
            "text": text,
            "confidence": confidence,
            "candidates": candidates,
            "blocks": blocks
        }

    except Exception as e:
        print(f"Error analyzing scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[LetterOut])
@router.get("/", response_model=List[LetterOut])
def list_letters(
    skip: int = 0,
    limit: int = 100,
    prisoner_cpid: Optional[str] = None,
    status: Optional[str] = None,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    # TODO: Filter for sponsors to only show their assigned letters/prisoners
    service = _service(db)
    return service.list_letters(skip=skip, limit=limit, prisoner_cpid=prisoner_cpid, status=status)


@router.get("/{letter_id}", response_model=LetterOut)
def get_letter(
    letter_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    # TODO: Verify sponsor access
    service = _service(db)
    try:
        return service.get_letter(letter_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{letter_id}", response_model=LetterOut)
def update_letter(
    letter_id: int,
    updates: LetterUpdate,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    try:
        return service.update_letter(letter_id, updates, changed_by=db_user.id if db_user else None)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{letter_id}/upload-preview", response_model=UploadDestinationPreview)
def preview_upload_redacted(
    letter_id: int,
    exchange_override: Optional[str] = None,
    sponsor_id_override: Optional[int] = None,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only: resolves where upload-redacted would file this letter,
    without uploading anything. Meant to back a confirmation step in the UI
    before the real upload runs -- see LetterService.resolve_upload_destination.
    `exchange_override` lets the frontend re-check a corrected exchange
    number (e.g. "5" or "intro"); `sponsor_id_override` lets it re-check
    against a manually picked Sponsor when the automatic sponsor_name match
    fails or picked the wrong one.
    """
    service = _service(db)
    try:
        return service.resolve_upload_destination(
            letter_id, exchange_override=exchange_override, sponsor_id_override=sponsor_id_override
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{letter_id}/upload-redacted", response_model=RedactedUploadResult)
def upload_redacted_letter(
    letter_id: int,
    payload: RedactedUploadRequest,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    """
    Letter Mgt's "Scan Letter" write path: files already-redacted page
    image(s) for this letter into the sponsor's OneDrive (or the local
    storage backend, if that's what's configured), alongside a blank
    reply doc. See LetterService.upload_redacted_to_sponsor_onedrive.
    """
    service = _service(db)
    try:
        files = [(f.filename, base64.b64decode(f.content_base64)) for f in payload.files]
        return service.upload_redacted_to_sponsor_onedrive(
            letter_id, files, changed_by=db_user.id if db_user else None,
            exchange_override=payload.exchange_override,
            sponsor_id_override=payload.sponsor_id_override,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{letter_id}/history", response_model=List[LetterStatusHistoryOut])
def get_letter_status_history(
    letter_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    """Full audit trail of every status this letter has held, in order."""
    service = _service(db)
    try:
        service.get_letter(letter_id)  # existence check
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return service.get_status_history(letter_id)


@router.patch("/{letter_id}/journey", response_model=LetterOut)
def update_letter_journey(
    letter_id: int,
    updates: LetterJourneyUpdate,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Manual half of the Letter Journey checklist (informed/finished/
    reviewed/printed/mailed) -- see LetterService.update_journey."""
    service = _service(db)
    try:
        return service.update_journey(letter_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{letter_id}/journey/check-visits", response_model=SponsorVisitStatsOut)
def check_letter_sponsor_visits(
    letter_id: int,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    On-demand live check of the "sponsor writing letter" touchpoint --
    queries the active storage backend for real visit stats on this
    letter's reply doc. See LetterService.check_sponsor_visits and
    OneDriveStorageService.get_visit_stats for what this does and doesn't
    guarantee (real but not real-time; unsupported on local storage or
    before upload).
    """
    service = _service(db)
    try:
        return service.check_sponsor_visits(letter_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{letter_id}/reminders", response_model=List[LetterReminderOut])
def list_letter_reminders(
    letter_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    """"Date(s) remind sponsor" log -- plural, so a list of entries rather than one field."""
    service = _service(db)
    try:
        service.get_letter(letter_id)  # existence check
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return service.list_reminders(letter_id)


@router.post("/{letter_id}/reminders", response_model=LetterReminderOut)
def add_letter_reminder(
    letter_id: int,
    payload: LetterReminderIn,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    try:
        return service.add_reminder(
            letter_id, payload.reminded_at, payload.note, created_by=db_user.id if db_user else None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{letter_id}/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_letter_reminder(
    letter_id: int,
    reminder_id: int,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    service = _service(db)
    try:
        service.delete_reminder(letter_id, reminder_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/translate-page", response_model=TranslateImageResult)
def translate_page(
    payload: TranslateImageRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Letter Mgt's Spanish-language workflow (added 31Aug2026): transcribe +
    draft-translate one already-redacted letter page. Local-only -- see
    OCRService.translate_image's docstring for why this has no cloud
    fallback, unlike envelope OCR. Not tied to a specific letter_id since
    it's stateless image processing; the frontend collects results per
    page before this feeds into /translation-docx or the final upload.

    This is a FIRST-PASS DRAFT. It is never uploaded to a sponsor directly
    -- see build_translation_review_docx's docstring for the review step
    this feeds into.
    """
    try:
        if "," in payload.image_data:
            _, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data
        image_bytes = base64.b64decode(encoded)
        return ocr_service.translate_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe-page", response_model=TranscribeImageResult)
def transcribe_page(
    payload: TranslateImageRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Step 1 of the standalone Translate tool's two-call flow (added
    31Aug2026, TranslateLetter.jsx) -- transcribe only, no translation.
    Split out from /translate-page so each phase (transcribe, then
    translate-lines below) is independently visible in that UI, and so
    doing them as two separate, shorter-output Ollama calls actually
    happens rather than being hidden inside one combined request -- see
    OCRService.translate_lines' docstring for why that split matters for
    accuracy, not just UI feedback.
    """
    try:
        if "," in payload.image_data:
            _, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data
        image_bytes = base64.b64decode(encoded)
        return ocr_service.transcribe_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe-page-cloud", response_model=TranscribeImageResult)
def transcribe_page_cloud(
    payload: TranscribeCloudRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Opt-in Google Vision OCR for letter content the local model struggles
    with (added 31Aug2026) -- see OCRService.transcribe_image_cloud_redacted's
    docstring for the real case that motivated this (a handwritten table
    read column-by-column instead of row-by-row, misordering content and
    compounding a separate end-of-generation accuracy drop).

    Structurally requires redaction_confirmed=true and refuses otherwise --
    this app's default is local-only OCR precisely because letter content
    is PII, so a cloud path has to be an explicit, narrow exception, not
    something reachable via any other flag/default. The frontend
    (TranslateLetter.jsx) only exposes this once every page has actually
    been run through PageRedactionEditor and marked redacted, but this
    check exists so that guarantee doesn't depend solely on frontend
    correctness -- there is no way to verify pixel content server-side, so
    this is the strongest enforcement actually available.
    """
    if not payload.redaction_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud OCR requires the page to be redacted first (redaction_confirmed must be true) -- this app never sends unredacted letter content to a cloud service.",
        )
    try:
        if "," in payload.image_data:
            _, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data
        image_bytes = base64.b64decode(encoded)
        return ocr_service.transcribe_image_cloud_redacted(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-lines", response_model=TranslateLinesResult)
def translate_lines(
    payload: TranslateLinesRequest,
    _admin: UserContext = Depends(require_admin),
):
    """Step 2 of the standalone Translate tool's two-call flow -- see transcribe_page above."""
    try:
        return ocr_service.translate_lines(payload.lines)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-lines-cloud", response_model=TranslateLinesResult)
def translate_lines_cloud(
    payload: TranslateLinesCloudRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Google Cloud Translate counterpart to /translate-lines -- added
    31Aug2026 at Rey's request, so the Google Vision cloud path can use
    Google end-to-end (OCR + translation) instead of handing off to the
    local model for the translation step.

    Same redaction_confirmed gate as /transcribe-page-cloud, and refuses
    the request otherwise -- this is letter content reaching Google, same
    posture as the OCR step, even though it's text rather than an image.
    """
    if not payload.redaction_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud translation requires the source page to have been redacted first (redaction_confirmed must be true).",
        )
    try:
        return ocr_service.translate_lines_cloud(payload.lines)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-overlay-cloud", response_model=OverlayTranslationResult)
def translate_overlay_cloud(
    payload: TranscribeCloudRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Image-overlay translation (added 31Aug2026) -- see
    OCRService.translate_overlay_cloud's docstring for the full rationale.
    Short version: detects text blocks with position via Google Vision,
    translates each via Google Cloud Translate, and paints the translation
    back onto a copy of the image at the same position, instead of
    linearizing the page into flat text first (the root cause of this
    session's repeated table/row/line-order formatting failures).

    Returns JSON: the composited PNG (base64) plus plain original/
    translated text -- added the same day as the image-only version, at
    Rey's request, since replying to a sponsee needs copy-pasteable text,
    not just a picture. Same redaction_confirmed gate as every other cloud
    endpoint in this file.
    """
    if not payload.redaction_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud overlay translation requires the page to be redacted first (redaction_confirmed must be true).",
        )
    try:
        if "," in payload.image_data:
            _, encoded = payload.image_data.split(",", 1)
        else:
            encoded = payload.image_data
        image_bytes = base64.b64decode(encoded)
        result = ocr_service.translate_overlay_cloud(image_bytes)
        return {
            "image_base64": base64.b64encode(result["image_bytes"]).decode("ascii"),
            "original_text": result["original_text"],
            "translation": result["translation"],
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translation-docx")
def translation_docx(
    payload: TranslationDocxRequest,
    _admin: UserContext = Depends(require_admin),
):
    """
    Bundles one or more translated pages into a downloadable .docx, clearly
    labeled as a draft needing review -- meant to be sent to a bilingual
    reviewer OUTSIDE the app (email/text, however Rey already communicates
    with them; no in-app reviewer role exists, a deliberate choice made
    31Aug2026), corrected, and the corrected file re-uploaded via Letter
    Mgt's existing "Upload Already-Redacted File" picker.
    """
    from fastapi.responses import Response as FastAPIResponse
    from services.artifact_docx import build_translation_review_docx

    pages = [p.dict() for p in payload.pages]
    docx_bytes = build_translation_review_docx(pages, personal_use=payload.personal_use)
    return FastAPIResponse(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=translation_draft_for_review.docx"},
    )


@router.post("/translation-docx/save-to-library")
def save_translation_docx_to_library(
    payload: TranslationDocxSaveRequest,
    _admin: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Same DOCX build as /translation-docx, but writes it to the Translations
    library root instead of (or in addition to being available for) a browser
    download -- so it shows up in Reference Hub's "Translations" tab while
    composing a reply to that letter.

    When a CPID is given, the filename is numbered using
    Prisoner.letters_received_count -- the live COUNT(Letter.id) computed in
    main.py's /api/prisoners (not the stored Letter.letter_exchange_count,
    which is a different, OneDrive-folder-scoped concept incremented only by
    the Envelope Mgt scan-confirm step and unrelated to this tool).
    """
    import base64
    import re
    from datetime import datetime
    from sqlalchemy import func
    from db.models import Letter
    from services.artifact_docx import build_translation_review_docx

    settings = get_settings()
    root = settings.library_translations_root
    if not root:
        raise HTTPException(status_code=503, detail="Translations library root is not configured")
    root.mkdir(parents=True, exist_ok=True)

    pages = [p.dict() for p in payload.pages]
    docx_bytes = build_translation_review_docx(pages, personal_use=payload.personal_use)

    if payload.cpid:
        safe_cpid = re.sub(r"[^A-Za-z0-9_-]", "", payload.cpid)
        letters_received_count = (
            db.query(func.count(Letter.id)).filter(Letter.prisoner_cpid == safe_cpid).scalar() or 0
        )
        date_str = datetime.now().strftime("%Y-%m-%d")
        stem = f"{safe_cpid}_{date_str}_in_{letters_received_count:03d}"
    else:
        safe_cpid = "unfiled"
        stem = re.sub(r"[^A-Za-z0-9_-]", "_", payload.title) if payload.title else datetime.now().strftime("translation_%Y-%m-%d_%H-%M-%S")

    filename = f"{stem}.docx"
    dest_dir = root / safe_cpid
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    dest_path.write_bytes(docx_bytes)

    overlay_filenames = []
    if payload.overlay_images:
        for i, img in enumerate(payload.overlay_images):
            if not img:
                continue
            raw = img.split(",", 1)[1] if img.startswith("data:") else img
            try:
                png_bytes = base64.b64decode(raw)
            except Exception:
                continue
            overlay_filename = f"{stem}_overlay_p{i + 1}.png"
            (dest_dir / overlay_filename).write_bytes(png_bytes)
            overlay_filenames.append(overlay_filename)

    return {
        "saved": True,
        "filename": filename,
        "cpid": safe_cpid,
        "path": str(dest_path.relative_to(root)),
        "overlay_filenames": overlay_filenames,
    }
