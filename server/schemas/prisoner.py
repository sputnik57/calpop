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


class PrisonerCreate(BaseModel):
    """For a person not yet in the system at all (Envelope Mgt: not-found branch).
    CPID is generated server-side, not supplied by the caller."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    cdcr_number: Optional[str] = None
    facility: Optional[str] = None
    housing: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    # Fail-safe default matches the same rule used everywhere else in this
    # app: unknown/unspecified -> "unsafe" (the generic sender address),
    # never assume "safe" for someone we have no classification for yet.
    safety_classification: str = "unsafe"
    sponsor_name: Optional[str] = None
