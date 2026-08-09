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
    # Deliberately two separate fields, never one merged file -- see
    # EnvelopeService for why safe/unsafe envelopes must never be combined
    # into a single print run.
    merged_envelope_url_safe: Optional[str] = None
    merged_envelope_url_unsafe: Optional[str] = None
