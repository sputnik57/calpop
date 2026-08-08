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
