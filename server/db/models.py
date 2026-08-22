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
from .encrypted_types import EncryptedString

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
    "queued_for_writing",
    "queued_for_letter_scan",
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
    # cpid is the intentionally-non-identifying reference code already used
    # as the join key everywhere in the app -- stays plaintext so it's still
    # queryable/indexable. safety_classification isn't identifying on its
    # own either. Everything else that identifies a specific person is
    # encrypted at rest (AES-256-GCM, see db/encrypted_types.py) and cannot
    # be filtered via SQL -- code that needs to match/search these fields
    # fetches rows and compares after decryption (see MatchingService).
    cpid: Mapped[str] = mapped_column(String(100), primary_key=True)
    first_name: Mapped[Optional[str]] = mapped_column(EncryptedString)
    last_name: Mapped[Optional[str]] = mapped_column(EncryptedString)
    aliases: Mapped[Optional[str]] = mapped_column(EncryptedString)
    facility: Mapped[Optional[str]] = mapped_column(EncryptedString)
    address: Mapped[Optional[str]] = mapped_column(EncryptedString)
    city: Mapped[Optional[str]] = mapped_column(EncryptedString)
    state: Mapped[Optional[str]] = mapped_column(EncryptedString)
    zip: Mapped[Optional[str]] = mapped_column(EncryptedString)
    cdcr_number: Mapped[Optional[str]] = mapped_column(EncryptedString)
    housing: Mapped[Optional[str]] = mapped_column(EncryptedString)
    safety_classification: Mapped[Optional[str]] = mapped_column(String(50))
    # Plaintext (not encrypted) -- deliberately queryable (WHERE sponsor_name !=
    # 'Course') to route Envelope Mgt's write-queue vs letter-scan-queue decision.
    # Synced from the roster's authoritative 'Sponsor' Excel column. "Course" is
    # the project owner's sentinel for "I'm handling this myself, no external
    # sponsor" -- not a real person's name.
    sponsor_name: Mapped[Optional[str]] = mapped_column(Text)

    # -- Added 18Aug2026 to stop dropping roster columns the Excel sheet
    # already had. Encryption follows the same rule as everything above:
    # plaintext only for short categorical/administrative values or counts
    # with no narrative content and no other identifying power; encrypt
    # anything else tied to a specific person (dates, free text), even with
    # no current query need, to match this model's existing default.
    intake_number: Mapped[Optional[int]] = mapped_column(Integer)  # roster's "Intake #" (sequential contact order), was an untitled column
    stage: Mapped[Optional[int]] = mapped_column(Integer)  # 12-step program stage; 12 = active sponsee, 2-89 = in program. Plaintext: dashboard stats filter on this directly.
    cdcr_db_verified: Mapped[Optional[str]] = mapped_column(Text)  # roster's "CDCR db verif" (Y/N)
    contract_status: Mapped[Optional[str]] = mapped_column(Text)  # roster's "contract" (e.g. "Signed")
    date_of_contract: Mapped[Optional[str]] = mapped_column(EncryptedString)
    needs_green_book: Mapped[Optional[str]] = mapped_column(Text)  # roster's "Needs Green book?" (Y/N)
    language: Mapped[Optional[str]] = mapped_column(Text)
    review_notes: Mapped[Optional[str]] = mapped_column(EncryptedString)  # free text -- may describe safety/case concerns
    date_sponsor_assigned: Mapped[Optional[str]] = mapped_column(EncryptedString)
    letter_exchange_count: Mapped[Optional[int]] = mapped_column(Integer)  # roster's "letter exchange (received only)"
    step_received_count: Mapped[Optional[int]] = mapped_column(Integer)  # roster's "Step (received only)"
    bph_date: Mapped[Optional[str]] = mapped_column(Text)  # Board of Parole Hearings date. Plaintext (not encrypted like the fields above) so upcoming hearings can be queried/sorted directly.

    # Print queue (added 18Aug2026): set the moment a scan is confirmed with
    # a human-verified address (see LetterService.create_letter_from_ocr),
    # cleared once that prisoner's envelope is actually generated (see
    # BatchService.process_batch). NULL = not queued. A plain nullable
    # timestamp rather than a separate join table -- a prisoner is only ever
    # in the queue once, so there's nothing a join table would model that
    # this doesn't already.
    queued_for_printing_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Added 22Aug2026: the scan-confirm "Add to Database" checkbox is
    # explicit, not automatic -- someone who only wrote in asking for
    # literature isn't a sponsee, and checking it off shouldn't silently
    # create a full roster record for them. Unchecked still creates a
    # Prisoner row (a Letter requires one to attach to -- NOT NULL FK) but
    # a minimal one (name/CDCR# only, no address/facility/sponsor), and
    # this flag marks it so as explicitly "never assigned a sponsor" for
    # reporting -- distinct from a real sponsee whose sponsor_name is
    # blank only because assignment hasn't happened YET.
    literature_only: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)

    letters: Mapped[List["Letter"]] = relationship(back_populates="prisoner")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="prisoner")


class Sponsor(Base, TimestampMixin):
    """
    Added 22Aug2026 -- Sponsors tab MVP. A roster/contact record, distinct
    from `User` (login identity, Azure AD-backed): most sponsors never log
    into CalPOP at all -- Rey manages everything on their behalf per the
    real workflow. No password/auth here on purpose; that's sponsor-portal
    territory (Phase 7, unverified/unbuilt), a separate and larger concern.

    Deliberately matched to Prisoner.sponsor_name by plain name string, NOT
    a foreign key -- sponsor_name is synced from the Excel roster and
    already drives Envelope Mgt's routing logic (classify_sponsor_name);
    a hard FK here would risk breaking that on any naming mismatch. This
    table is purely additive: contact info CalPOP didn't track before.
    """
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    pseudonym: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    # "individual" (few sponsees, gets a per-sponsee CPID folder + exchangeX
    # subfolder on OneDrive) vs "course" (Rey's own/"Course" bulk sponsees,
    # gets two top-level active/inactive folders instead) -- see the
    # correspondence-workflow OneDrive naming conventions.
    sponsor_type: Mapped[str] = mapped_column(Text, nullable=False, default="individual")
    onedrive_folder_link: Mapped[Optional[str]] = mapped_column(Text)


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

    @property
    def letter_exchange_count(self) -> Optional[int]:
        """Not a real column -- reads through to Prisoner.letter_exchange_count
        so LetterOut can surface it (e.g. the scan-confirm screen telling
        staff what number to write on the physical envelope) without a
        separate round trip. Relies on Letter.prisoner being loaded
        (LetterService._query() always selectinloads it)."""
        return self.prisoner.letter_exchange_count if self.prisoner else None
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
    status_history: Mapped[List["LetterStatusHistory"]] = relationship(
        back_populates="letter", cascade="all, delete-orphan", order_by="LetterStatusHistory.changed_at"
    )


class LetterStatusHistory(Base):
    """
    Added 18Aug2026, scoped from a direct request: Letter.status is a single
    mutable column that only ever holds the *current* value -- every prior
    stage a letter passed through is silently lost the moment it changes.
    This is the audit trail. LetterService writes one row here every time
    Letter.status is set (including the very first value, not just
    subsequent changes), never edits or deletes existing rows.

    `note` is free text for now, not structured sub-step tracking (e.g. the
    real workflow's "6a", "8S" in docs/status_workflow.md) -- Letter.status
    itself hasn't been reconciled against that real process yet, so this
    table intentionally doesn't get ahead of it with a schema for sub-steps
    that don't exist anywhere else yet.
    """
    id: Mapped[int] = mapped_column(primary_key=True)
    letter_id: Mapped[int] = mapped_column(ForeignKey("letter.id"), nullable=False)
    status: Mapped[str] = mapped_column(letter_status_enum, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    changed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"))
    note: Mapped[Optional[str]] = mapped_column(Text)

    letter: Mapped["Letter"] = relationship(back_populates="status_history")
    changed_by_user: Mapped[Optional["User"]] = relationship()


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
