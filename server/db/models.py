from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    and_,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

letter_status_enum = Enum(
    "intake",
    "scanned",
    "redacted",
    "reviewed",
    "assigned",
    "response_started",
    "sponsor_submitted",
    "revisions_requested",
    "approved",
    "archived",
    name="letterstatus",
)

submission_status_enum = Enum(
    "draft",
    "submitted",
    "revisions_requested",
    "approved",
    name="submissionstatus",
)

envelope_status_enum = Enum(
    "queued",
    "processing",
    "completed",
    "failed",
    name="envelopestatus",
)

environment_enum = Enum("safe", "unsafe", name="environmenttype")

content_format_enum = Enum("markdown", "html", "plaintext", name="contentformat")
submission_artifact_type_enum = Enum("docx", "pdf", "txt", "envelope", name="submissionartifacttype")
submission_artifact_backend_enum = Enum("local", "onedrive", name="submissionartifactbackend")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class User(Base, TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    assignments: Mapped[List["Assignment"]] = relationship(back_populates="sponsor", foreign_keys="Assignment.sponsor_id")
    submissions: Mapped[List["Submission"]] = relationship(back_populates="sponsor", foreign_keys="Submission.sponsor_id")
    audit_logs: Mapped[List["AuditLog"]] = relationship(back_populates="actor")


class Prisoner(Base, TimestampMixin):
    cpid: Mapped[str] = mapped_column(String(100), primary_key=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100))
    aliases: Mapped[Optional[str]] = mapped_column(Text)
    facility: Mapped[Optional[str]] = mapped_column(String(255))
    address: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(50))
    zip: Mapped[Optional[str]] = mapped_column(String(20))
    safety_classification: Mapped[Optional[str]] = mapped_column(String(50))

    letters: Mapped[List["Letter"]] = relationship(back_populates="prisoner")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="prisoner")


sponsor_prisoner_table = Table(
    "sponsorprisoner",
    Base.metadata,
    Column("sponsor_id", ForeignKey("user.id"), primary_key=True),
    Column("prisoner_cpid", ForeignKey("prisoner.cpid"), primary_key=True),
)


class LetterVersion(Base, TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_format: Mapped[str] = mapped_column(content_format_enum, nullable=False, default="markdown")
    autosave: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    version_label: Mapped[Optional[str]] = mapped_column(String(100))

    letter: Mapped["Letter"] = relationship(back_populates="versions", foreign_keys=[letter_id])
    author: Mapped[Optional["User"]] = relationship()


class Letter(Base, TimestampMixin):
    __table_args__ = (UniqueConstraint("prisoner_cpid", "id", name="uq_letter_prisoner_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    prisoner_cpid: Mapped[str] = mapped_column(ForeignKey("prisoner.cpid"), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    intake_source: Mapped[Optional[str]] = mapped_column(String(100))
    original_file_path: Mapped[Optional[str]] = mapped_column(String(255))
    redacted_file_ref: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(letter_status_enum, nullable=False, default="intake")
    tags: Mapped[Optional[str]] = mapped_column(Text)
    content_format: Mapped[str] = mapped_column(content_format_enum, nullable=False, default="markdown")
    latest_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("letterversion.id", ondelete="SET NULL"))

    prisoner: Mapped["Prisoner"] = relationship(back_populates="letters")
    created_by_user: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by])
    latest_version: Mapped[Optional["LetterVersion"]] = relationship(
        foreign_keys=[latest_version_id],
        post_update=True,
    )
    versions: Mapped[List["LetterVersion"]] = relationship(
        back_populates="letter",
        cascade="all, delete-orphan",
        order_by="LetterVersion.created_at",
        foreign_keys="[LetterVersion.letter_id]",
    )
    dates: Mapped[Optional["LetterDates"]] = relationship(back_populates="letter", uselist=False, cascade="all, delete-orphan")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="letter", cascade="all, delete-orphan")
    submissions: Mapped[List["Submission"]] = relationship(back_populates="letter", cascade="all, delete-orphan")
    ocr_artifacts: Mapped[List["OCRArtifact"]] = relationship(back_populates="letter", cascade="all, delete-orphan")
    redaction_events: Mapped[List["RedactionEvent"]] = relationship(back_populates="letter", cascade="all, delete-orphan")
    audit_logs: Mapped[List["AuditLog"]] = relationship(back_populates="letter", cascade="all, delete-orphan")


class LetterDates(Base):
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), primary_key=True)
    scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    picked_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    postmarked_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    response_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    response_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    letter: Mapped["Letter"] = relationship(back_populates="dates")


class OCRArtifact(Base, TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), nullable=False)
    source_file_ref: Mapped[Optional[str]] = mapped_column(String(255))
    text: Mapped[Optional[str]] = mapped_column(Text)
    confidence: Mapped[Optional[float]] = mapped_column()
    blocks: Mapped[Optional[dict]] = mapped_column(JSON)
    transformations: Mapped[Optional[dict]] = mapped_column(JSON)

    letter: Mapped["Letter"] = relationship(back_populates="ocr_artifacts")


class Assignment(Base, TimestampMixin):
    __table_args__ = (UniqueConstraint("letter_id", "sponsor_id", name="uq_assignment_letter_sponsor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), nullable=False)
    sponsor_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    prisoner_cpid: Mapped[str] = mapped_column(ForeignKey("prisoner.cpid"), nullable=False)
    assigned_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    letter: Mapped["Letter"] = relationship(back_populates="assignments")
    sponsor: Mapped["User"] = relationship(back_populates="assignments", foreign_keys=[sponsor_id])
    prisoner: Mapped["Prisoner"] = relationship(back_populates="assignments")
    assigned_by_user: Mapped[Optional["User"]] = relationship(foreign_keys=[assigned_by])



class Submission(Base, TimestampMixin):
    __table_args__ = (UniqueConstraint("letter_id", "sponsor_id", name="uq_submission_letter_sponsor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), nullable=False)
    sponsor_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255))
    content: Mapped[Optional[str]] = mapped_column(Text)
    content_format: Mapped[str] = mapped_column(content_format_enum, default="markdown", nullable=False)
    attachments: Mapped[Optional[dict]] = mapped_column(JSON)
    onedrive_item_id: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(submission_status_enum, default="draft", nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    revisions_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    revision_comment: Mapped[Optional[str]] = mapped_column(Text)
    approval_comment: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    current_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("submissionversion.id", ondelete="SET NULL"))
    autosave_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("submissionversion.id", ondelete="SET NULL"))

    letter: Mapped["Letter"] = relationship(back_populates="submissions")
    sponsor: Mapped["User"] = relationship(back_populates="submissions", foreign_keys=[sponsor_id])
    reviewer: Mapped[Optional["User"]] = relationship(foreign_keys=[reviewed_by])
    current_version: Mapped[Optional["SubmissionVersion"]] = relationship(
        foreign_keys=[current_version_id], post_update=True
    )
    autosave_version: Mapped[Optional["SubmissionVersion"]] = relationship(
        foreign_keys=[autosave_version_id], post_update=True
    )
    versions: Mapped[List["SubmissionVersion"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionVersion.created_at",
        foreign_keys="[SubmissionVersion.submission_id]",
    )
    artifacts: Mapped[List["SubmissionArtifact"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
    )
    status_history: Mapped[List["SubmissionStatusHistory"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionStatusHistory.created_at",
    )


class EnvelopeJob(Base, TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    prisoner_cpid: Mapped[str] = mapped_column(ForeignKey("prisoner.cpid"), nullable=False)
    template_id: Mapped[Optional[str]] = mapped_column(String(100))
    environment: Mapped[str] = mapped_column(environment_enum, nullable=False)
    status: Mapped[str] = mapped_column(envelope_status_enum, nullable=False, default="queued")
    pdf_ref: Mapped[Optional[str]] = mapped_column(String(255))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    error: Mapped[Optional[str]] = mapped_column(Text)
    letter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("letter.id"))

    prisoner: Mapped["Prisoner"] = relationship()
    letter: Mapped[Optional["Letter"]] = relationship()


class SubmissionVersion(Base, TimestampMixin):
    __tablename__ = "submissionversion"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_format: Mapped[str] = mapped_column(content_format_enum, nullable=False, default="markdown")
    autosave: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version_label: Mapped[Optional[str]] = mapped_column(String(100))

    submission: Mapped["Submission"] = relationship(back_populates="versions", foreign_keys=[submission_id])
    author: Mapped[Optional["User"]] = relationship()
    artifacts: Mapped[List["SubmissionArtifact"]] = relationship(back_populates="version")


class SubmissionArtifact(Base, TimestampMixin):
    __tablename__ = "submissionartifact"
    __table_args__ = (
        UniqueConstraint("submission_id", "artifact_type", "file_name", name="uq_submissionartifact_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), nullable=False)
    version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("submissionversion.id", ondelete="SET NULL"))
    artifact_type: Mapped[str] = mapped_column(submission_artifact_type_enum, nullable=False)
    storage_backend: Mapped[str] = mapped_column(submission_artifact_backend_enum, nullable=False, default="local")
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[Optional[str]] = mapped_column(String(64))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))

    submission: Mapped["Submission"] = relationship(back_populates="artifacts")
    version: Mapped[Optional["SubmissionVersion"]] = relationship(back_populates="artifacts")
    creator: Mapped[Optional["User"]] = relationship()


class SubmissionStatusHistory(Base, TimestampMixin):
    __tablename__ = "submissionstatushistory"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(submission_status_enum)
    to_status: Mapped[str] = mapped_column(submission_status_enum, nullable=False)
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    comment: Mapped[Optional[str]] = mapped_column(Text)

    submission: Mapped["Submission"] = relationship(back_populates="status_history")
    actor: Mapped[Optional["User"]] = relationship()


class RedactionEvent(Base, TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    score: Mapped[Optional[float]] = mapped_column()
    performed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    performed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    letter: Mapped["Letter"] = relationship(back_populates="redaction_events")
    user: Mapped[Optional["User"]] = relationship(foreign_keys=[performed_by])


class AuditLog(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100))
    resource_id: Mapped[Optional[int]] = mapped_column()
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSON)
    letter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("letter.id"))

    actor: Mapped[Optional["User"]] = relationship(back_populates="audit_logs")
    letter: Mapped[Optional["Letter"]] = relationship(back_populates="audit_logs")


# Late-bound relationships
Assignment.active_submission = relationship(
    Submission,
    primaryjoin=and_(
        Assignment.letter_id == Submission.letter_id,
        Assignment.sponsor_id == Submission.sponsor_id
    ),
    foreign_keys=[Submission.letter_id, Submission.sponsor_id],
    uselist=False,
    viewonly=True
)
