from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SponsorCreate(BaseModel):
    name: str
    pseudonym: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    sponsor_type: str = "individual"  # 'individual' | 'course'
    onedrive_folder_link: Optional[str] = None
    active: bool = True  # False = archived (dropped); still shown in the directory, excluded from upload-destination pickers


class SponsorOut(SponsorCreate):
    id: int
    created_at: datetime
    # Split 29Sep2026 (was one sponsee_count: int) -- a flat count silently
    # mixed in Stage 90+ (dropped/silent) with real active sponsees, which
    # read as "too high." active = Stage 1-12 (main sequence); dormant =
    # Stage 90+ (terminal/exception codes). Shown as "active/dormant" in the UI.
    sponsee_count_active: int = 0
    sponsee_count_dormant: int = 0

    class Config:
        from_attributes = True
