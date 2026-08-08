from typing import List, Optional
from pydantic import BaseModel

class BatchLetterCreate(BaseModel):
    prisoner_cpids: List[str]
    title: str
    content: str
    content_format: str = "markdown"

class BatchResponse(BaseModel):
    processed_count: int
    submission_ids: List[int]
    merged_pdf_url: Optional[str] = None
    merged_envelope_url: Optional[str] = None
