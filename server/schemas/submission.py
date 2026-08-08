from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from db.models import submission_status_enum


class SubmissionVersionBase(BaseModel):
    content: str = Field(..., description="Raw submission content")
    content_format: str = Field(..., description="markdown|html|plaintext")
    autosave: bool = Field(False, description="Flag for autosaved entries")
    version_label: Optional[str] = Field(None, description="Optional label for version")


class SubmissionVersionCreate(SubmissionVersionBase):
    pass


class SubmissionVersionOut(SubmissionVersionBase):
    id: int
    author_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubmissionArtifactOut(BaseModel):
    id: int
    artifact_type: str
    file_path: str
    file_name: str
    sha256: Optional[str]
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class SubmissionStatusHistoryOut(BaseModel):
    id: int
    from_status: Optional[str]
    to_status: str
    actor_id: Optional[int]
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SubmissionBase(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    content_format: str = Field(..., description="markdown|html|plaintext")
    status: str = Field(default="draft", description="Submission status enum")
    revision_comment: Optional[str] = None
    approval_comment: Optional[str] = None


class SubmissionCreate(SubmissionBase):
    letter_id: int


class SubmissionUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    revision_comment: Optional[str] = None
    approval_comment: Optional[str] = None


class SubmissionReview(BaseModel):
    comment: Optional[str] = Field(None, description="Reviewer comment")


class SubmissionOut(SubmissionBase):
    id: int
    letter_id: int
    sponsor_id: int
    submitted_at: Optional[datetime]
    revisions_requested_at: Optional[datetime]
    approved_at: Optional[datetime]
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    current_version_id: Optional[int]
    autosave_version_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    versions: List[SubmissionVersionOut] = []
    artifacts: List[SubmissionArtifactOut] = []
    status_history: List[SubmissionStatusHistoryOut] = []

    class Config:
        from_attributes = True


class SubmissionListOut(BaseModel):
    items: List[SubmissionOut]
    total: int
