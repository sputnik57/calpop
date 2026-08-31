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


class PrisonerUpdate(BaseModel):
    """DB Mgt's Update Person form (client/src/pages/PrisonersPage.jsx). Every
    field is a plain string on the wire -- the form's <input> elements always
    send strings, even for the integer columns (stage, letter_exchange_count,
    step_received_count), so those get parsed in the endpoint rather than
    validated as int here. A blank string means "clear this field," not
    "leave unchanged" -- the frontend always sends the full form, not a
    partial diff, so there's no way to distinguish the two on the wire."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    cdcr_number: Optional[str] = None
    facility: Optional[str] = None
    housing: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    safety_classification: Optional[str] = None
    sponsor_name: Optional[str] = None
    stage: Optional[str] = None
    cdcr_db_verified: Optional[str] = None
    contract_status: Optional[str] = None
    date_of_contract: Optional[str] = None
    needs_green_book: Optional[str] = None
    language: Optional[str] = None
    review_notes: Optional[str] = None
    date_sponsor_assigned: Optional[str] = None
    letter_exchange_count: Optional[str] = None
    step_received_count: Optional[str] = None
    bph_date: Optional[str] = None
