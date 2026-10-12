from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class SponsorCreate(BaseModel):
    name: str
    pseudonym: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    sponsor_type: str = "individual"  # 'individual' | 'course'
    onedrive_folder_link: Optional[str] = None
    active: bool = True  # False = archived (dropped); still shown in the directory, excluded from upload-destination pickers


class SponseeBrief(BaseModel):
    cpid: str
    first_name: Optional[str] = None  # decrypted; admin-only endpoint, shown as a tooltip
    stage: Optional[int] = None
    current_step: Optional[str] = None  # roster's "Current Step", free text ("Step 4", "Intro"); decrypted


class SponsorOut(SponsorCreate):
    id: int
    created_at: datetime
    # Split 29Sep2026 (was one sponsee_count: int) -- a flat count silently
    # mixed in Stage 90+ (dropped/silent) with real active sponsees, which
    # read as "too high." active = Stage 1-12 (main sequence); dormant =
    # Stage 90+ (terminal/exception codes). Shown as "active/dormant" in the UI.
    sponsee_count_active: int = 0
    sponsee_count_dormant: int = 0
    # Added 11Oct2026 so the directory can show WHO each sponsor has, not
    # just how many. Same name matching as the counts (_count_for), every
    # stage included; the UI splits active (1-12) from dormant (90+).
    sponsees: List[SponseeBrief] = []

    class Config:
        from_attributes = True
