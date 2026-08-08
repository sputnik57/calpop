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
