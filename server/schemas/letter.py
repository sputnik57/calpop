from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from db.models import letter_status_enum, content_format_enum


class LetterDatesOut(BaseModel):
    scanned_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    postmarked_at: Optional[datetime] = None
    response_started_at: Optional[datetime] = None
    response_submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LetterStatusHistoryOut(BaseModel):
    id: int
    status: str
    changed_at: datetime
    changed_by: Optional[int] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True


class LetterVersionBase(BaseModel):
    content: str
    content_format: str = "markdown"
    version_label: Optional[str] = None


class LetterVersionOut(LetterVersionBase):
    id: int
    created_at: datetime
    created_by: Optional[int]

    class Config:
        from_attributes = True


class LetterBase(BaseModel):
    title: Optional[str] = None
    intake_source: Optional[str] = None
    status: str = "intake"
    tags: Optional[str] = None
    content_format: str = "markdown"


class LetterCreate(LetterBase):
    prisoner_cpid: str
    original_file_path: Optional[str] = None


class LetterScanIngest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded image data string")
    prisoner_cpid: Optional[str] = Field(None, description="Prisoner CPID if known, otherwise system tries to detect or assigns default")
    filename: str = "webcam_capture.jpg"
    date_picked_up_po: Optional[datetime] = Field(
        None, description="Manually entered: when staff physically picked this up from the PO box (distinct from the postmark date)."
    )
    routing_status_override: Optional[str] = Field(
        None, description="'queued_for_writing' or 'queued_for_letter_scan' -- required if the prisoner's Sponsor value is ambiguous (see 409 response from a first attempt without this)."
    )
    # Scan-confirm address verification (added 18Aug2026). address_verified
    # is the human's yes/no on whatever the frontend showed them (either the
    # on-file address as-is, or corrected_address below); it's what actually
    # gates the letter_exchange_count increment and print-queue add in
    # LetterService.create_letter_from_ocr -- not the automated OCR match
    # score, which is advisory only.
    address_verified: Optional[bool] = Field(
        None, description="Human confirmation that the on-file address (or corrected_address below) is correct. Gates letter_exchange_count increment and print-queue add."
    )
    corrected_address: Optional[str] = None
    corrected_city: Optional[str] = None
    corrected_state: Optional[str] = None
    corrected_zip: Optional[str] = None


class LetterUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[str] = None
    redacted_file_ref: Optional[str] = None
    content_format: Optional[str] = None


class LetterOut(LetterBase):
    id: int
    prisoner_cpid: str
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    original_file_path: Optional[str]
    redacted_file_ref: Optional[str]
    latest_version_id: Optional[int]
    latest_version: Optional[LetterVersionOut] = None
    
    dates: Optional[LetterDatesOut] = None
    versions: List[LetterVersionOut] = []

    class Config:
        from_attributes = True


class LetterListOut(BaseModel):
    items: List[LetterOut]
    total: int
