from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from schemas.letter import LetterOut
from schemas.prisoner import PrisonerOut
from schemas.submission import SubmissionOut


class AssignmentBase(BaseModel):
    notes: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = "active"


class AssignmentCreate(AssignmentBase):
    letter_id: int
    sponsor_id: int
    prisoner_cpid: str


class StartLetterRequest(BaseModel):
    """Kicks off a letter with no scanned original -- creates a bare Letter
    row (status queued_for_writing) and its Assignment in one call, so it
    shows up in the Inbox work queue exactly like a scanned/routed letter
    would, just without an original_file_path."""
    prisoner_cpid: str
    title: Optional[str] = None


class AssignmentOut(AssignmentBase):
    id: int
    letter_id: int
    sponsor_id: int
    prisoner_cpid: str
    assigned_by: Optional[int]
    assigned_at: datetime
    
    letter: Optional[LetterOut] = None
    prisoner: Optional[PrisonerOut] = None
    active_submission: Optional[SubmissionOut] = None

    class Config:
        from_attributes = True
