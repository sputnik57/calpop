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


class SponsorOut(SponsorCreate):
    id: int
    created_at: datetime
    sponsee_count: int = 0  # computed: count of Prisoner rows matching this sponsor's name

    class Config:
        from_attributes = True
