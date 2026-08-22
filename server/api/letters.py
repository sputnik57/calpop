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
from schemas.letter import LetterCreate, LetterOut, LetterScanIngest, LetterStatusHistoryOut, LetterUpdate
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
