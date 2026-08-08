from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class PrisonerBase(BaseModel):
    cpid: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    facility: Optional[str] = None


class PrisonerOut(PrisonerBase):
    created_at: datetime

    class Config:
        from_attributes = True
