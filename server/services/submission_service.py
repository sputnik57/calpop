from datetime import datetime
import hashlib
from typing import List, Optional, Tuple, Any

from sqlalchemy.orm import Session, selectinload

from db.models import (
    Assignment,
    Submission,
    SubmissionArtifact,
    SubmissionStatusHistory,
    SubmissionVersion,
)
from schemas.submission import (
    SubmissionCreate,
    SubmissionReview,
    SubmissionUpdate,
    SubmissionVersionCreate,
)
from services.artifact_service import SubmissionArtifactService
from services.pdf_service import PDFService


class SubmissionService:
    """Domain operations for sponsor submissions."""

    def __init__(
        self,
        db: Session,
        artifact_service: Optional[SubmissionArtifactService] = None,
        envelope_service: Optional[Any] = None,
        storage_backend: str = "local",
    ) -> None:
        self.db = db
        self.artifact_service = artifact_service
        self.envelope_service = envelope_service
        self.storage_backend = storage_backend

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------
    def _query(self):
        return (
            self.db.query(Submission)
            .options(
                selectinload(Submission.versions),
                selectinload(Submission.artifacts),
                selectinload(Submission.status_history),
            )
        )

    def _get_submission(self, submission_id: int) -> Submission:
        submission = self._query().filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError("Submission not found")
        return submission

    def _require_assignment(self, letter_id: int, sponsor_id: int) -> None:
        assignment_exists = (
            self.db.query(Assignment)
            .filter(Assignment.letter_id == letter_id, Assignment.sponsor_id == sponsor_id)
            .first()
        )
        if not assignment_exists:
            raise PermissionError("Sponsor is not assigned to this letter")

    def _append_history(
        self,
        submission: Submission,
        from_status: Optional[str],
        to_status: str,
        actor_id: Optional[int],
        comment: Optional[str] = None,
    ) -> None:
        history = SubmissionStatusHistory(
            submission_id=submission.id,
            from_status=from_status,
            to_status=to_status,
            actor_id=actor_id,
            comment=comment,
        )
        self.db.add(history)

    def _ensure_artifact_service(self) -> SubmissionArtifactService:
        if not self.artifact_service:
            raise RuntimeError("Artifact service not configured")
        return self.artifact_service

    # ------------------------------------------------------------------
    # CRUD & listing helpers
    # ------------------------------------------------------------------
    def create_submission(
        self,
        sponsor_id: int,
        data: SubmissionCreate,
    ) -> Submission:
        self._require_assignment(data.letter_id, sponsor_id)

        submission = Submission(
            letter_id=data.letter_id,
            sponsor_id=sponsor_id,
            title=data.title,
            content=data.content,
            content_format=data.content_format,
            status=data.status,
        )
        self.db.add(submission)
        self.db.flush()

        if data.content:
            version_payload = SubmissionVersionCreate(
                content=data.content,
                content_format=data.content_format,
                autosave=False,
            )
            version = self._create_version(
                submission,
                version_payload,
                sponsor_id,
                autosave=False,
                version_label="Initial",
            )
            submission.current_version_id = version.id

        self.db.commit()
        return self._get_submission(submission.id)

    def list_submissions_for_sponsor(self, sponsor_id: int) -> List[Submission]:
        return (
            self._query()
            .filter(Submission.sponsor_id == sponsor_id)
            .order_by(Submission.updated_at.desc())
            .all()
        )

    def list_submissions(
        self,
        *,
        statuses: Optional[List[str]] = None,
        sponsor_id: Optional[int] = None,
    ) -> List[Submission]:
        query = self._query()
        if sponsor_id is not None:
            query = query.filter(Submission.sponsor_id == sponsor_id)
        if statuses:
            query = query.filter(Submission.status.in_(statuses))
        return query.order_by(Submission.updated_at.desc()).all()

    def update_submission(
        self,
        submission_id: int,
        updates: SubmissionUpdate,
        *,
        sponsor_id: Optional[int] = None,
        reviewer_id: Optional[int] = None,
    ) -> Submission:
        submission = self._get_submission(submission_id)

        if sponsor_id is not None:
            self._require_assignment(submission.letter_id, sponsor_id)

        previous_status = submission.status

        if updates.title is not None:
            submission.title = updates.title
        if updates.content is not None:
            submission.content = updates.content
        if updates.revision_comment is not None:
            submission.revision_comment = updates.revision_comment
        if updates.approval_comment is not None:
            submission.approval_comment = updates.approval_comment

        if updates.content:
            version_payload = SubmissionVersionCreate(
                content=updates.content,
                content_format=submission.content_format,
                autosave=False,
            )
            version = self._create_version(submission, version_payload, sponsor_id, autosave=False)
            submission.current_version_id = version.id

        if updates.status and updates.status != submission.status:
            submission.status = updates.status
            if updates.status == "submitted":
                submission.submitted_at = datetime.utcnow()
            elif updates.status == "revisions_requested":
                submission.revisions_requested_at = datetime.utcnow()
            elif updates.status == "approved":
                submission.approved_at = datetime.utcnow()

            self._append_history(
                submission,
                previous_status,
                submission.status,
                reviewer_id or sponsor_id,
                updates.revision_comment if updates.status == "revisions_requested" else updates.approval_comment,
            )

        self.db.commit()
        return self._get_submission(submission.id)

    # ------------------------------------------------------------------
    # Workflow helpers
    # ------------------------------------------------------------------
    def autosave(
        self,
        submission_id: int,
        payload: SubmissionVersionCreate,
        *,
        sponsor_id: Optional[int] = None,
    ) -> Submission:
        submission = self._get_submission(submission_id)
        if sponsor_id is not None:
            self._require_assignment(submission.letter_id, sponsor_id)
        if submission.status not in {"draft", "revisions_requested"}:
            raise ValueError("Autosave available only in draft or revisions_requested state")

        version = self._create_version(submission, payload, sponsor_id, autosave=True)
        submission.autosave_version_id = version.id
        submission.content = payload.content

        self.db.commit()
        return self._get_submission(submission.id)

    def submit_submission(self, submission_id: int, sponsor_id: int) -> Submission:
        submission = self._get_submission(submission_id)
        self._require_assignment(submission.letter_id, sponsor_id)
        if submission.status not in {"draft", "revisions_requested"}:
            raise ValueError("Only draft or revisions_requested submissions can be submitted")

        previous_status = submission.status
        submission.status = "submitted"
        submission.submitted_at = datetime.utcnow()
        submission.revision_comment = None

        self._append_history(submission, previous_status, submission.status, sponsor_id)
        self.db.commit()
        return self._get_submission(submission.id)

    def request_revisions(
        self,
        submission_id: int,
        reviewer_id: int,
        payload: SubmissionReview,
    ) -> Submission:
        submission = self._get_submission(submission_id)
        previous_status = submission.status
        submission.status = "revisions_requested"
        submission.revisions_requested_at = datetime.utcnow()
        submission.reviewed_by = reviewer_id
        submission.reviewed_at = datetime.utcnow()
        submission.revision_comment = payload.comment

        self._append_history(submission, previous_status, submission.status, reviewer_id, payload.comment)
        self.db.commit()
        return self._get_submission(submission.id)

    def approve_submission(
        self,
        submission_id: int,
        reviewer_id: int,
        payload: SubmissionReview,
    ) -> Submission:
        submission = self._get_submission(submission_id)
        previous_status = submission.status
        submission.status = "approved"
        submission.approved_at = datetime.utcnow()
        submission.reviewed_by = reviewer_id
        submission.reviewed_at = datetime.utcnow()
        submission.approval_comment = payload.comment

        self._append_history(submission, previous_status, submission.status, reviewer_id, payload.comment)
        
        # Generate artifacts by passing the submission object to avoid re-querying
        artifacts_generated = []
        try:
            pdf_artifact, _ = self._generate_artifact_internal(submission, "pdf", actor_id=reviewer_id)
            artifacts_generated.append(("pdf", pdf_artifact))
        except Exception as e:
            logger.error(f"Error generating PDF for submission {submission_id}: {e}")
            import traceback
            traceback.print_exc()
        
        try:
            env_artifact, _ = self._generate_artifact_internal(submission, "envelope", actor_id=reviewer_id)
            artifacts_generated.append(("envelope", env_artifact))
        except Exception as e:
            logger.error(f"Error generating envelope for submission {submission_id}: {e}")
            import traceback
            traceback.print_exc()
        
        # Commit everything together
        self.db.commit()

        return self._get_submission(submission.id)

    def generate_artifact(
        self,
        submission_id: int,
        fmt: str,
        actor_id: Optional[int],
        auto_commit: bool = True,
    ) -> Tuple[SubmissionArtifact, str]:
        submission = self._get_submission(submission_id)
        artifact_service = self._ensure_artifact_service()

        content = submission.content or ""
        fmt = fmt.lower()
        sha256 = None
        
        if fmt == "txt":
            dest = artifact_service.export_txt(submission_id, content)
            media_type = "text/plain"
        elif fmt == "docx":
            dest = artifact_service.export_docx(submission_id, content)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif fmt == "pdf":
            # Use improved PDFService
            pdf_service = PDFService()
            # We need to serialize the submission object or pass relevant data
            # SubmissionOut is a Pydantic model, here we have ORM model. 
            # PDFService expects SubmissionOut-like object (with .content, .submitted_at)
            # The ORM object has these fields, so it should work if typed loosely or if we map it.
            # Let's pass the ORM object, assuming PDFService handles attributes.
            pdf_buffer = pdf_service.generate_letter_pdf(submission)
            
            # Save to disk using ArtifactService path helper
            dest = artifact_service._destination(submission_id, "pdf")
            with open(dest, "wb") as f:
                f.write(pdf_buffer.getvalue())
                
            media_type = "application/pdf"
        elif fmt == "envelope":
            if not self.envelope_service:
                raise RuntimeError("Envelope service not configured")
            
            # Need prisoner details from Excel manager since they might be sensitive
            from globals import excel_manager
            prisoner_cpid = submission.letter.prisoner_cpid
            prisoner_details = excel_manager.resolve_name_from_cpid(prisoner_cpid)
            
            # Fallback if no details
            if not prisoner_details:
                # Use basic info from DB if possible or error
                # For now error as before
                 if not submission.letter.prisoner:
                     raise ValueError(f"No prisoner record for letter {submission.letter_id}")
                 # Minimal dict from ORM
                 prisoner_details = {
                     "first_name": submission.letter.prisoner.first_name,
                     "last_name": submission.letter.prisoner.last_name,
                     "cpid": submission.letter.prisoner.cpid,
                     # we might miss address here if it's only in excel
                 }

            dest = self.envelope_service.generate_envelope(submission_id, prisoner_details)
            media_type = "application/pdf"
        else:
            raise ValueError("Unsupported export format")

        if not sha256:
             sha256 = hashlib.sha256(dest.read_bytes()).hexdigest()

        artifact = SubmissionArtifact(
            submission_id=submission.id,
            version_id=submission.current_version_id,
            artifact_type=fmt,
            storage_backend=self.storage_backend,
            file_path=str(dest),
            file_name=dest.name,
            sha256=sha256,
            created_by=actor_id,
        )
        self.db.add(artifact)
        if auto_commit:
            self.db.commit()
            self.db.refresh(artifact)
        return artifact, media_type

    def _generate_artifact_internal(
        self,
        submission: Submission,
        fmt: str,
        actor_id: Optional[int],
    ) -> Tuple[SubmissionArtifact, str]:
        """
        Internal method that generates artifacts without re-querying the submission.
        Used during approval to avoid session conflicts.
        """
        artifact_service = self._ensure_artifact_service()

        content = submission.content or ""
        fmt = fmt.lower()
        sha256 = None
        
        if fmt == "txt":
            dest = artifact_service.export_txt(submission.id, content)
            media_type = "text/plain"
        elif fmt == "docx":
            dest = artifact_service.export_docx(submission.id, content)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif fmt == "pdf":
            # Use improved PDFService
            pdf_service = PDFService()
            pdf_buffer = pdf_service.generate_letter_pdf(submission)
            
            # Save to disk using ArtifactService path helper
            dest = artifact_service._destination(submission.id, "pdf")
            with open(dest, "wb") as f:
                f.write(pdf_buffer.getvalue())
                
            media_type = "application/pdf"
        elif fmt == "envelope":
            if not self.envelope_service:
                raise RuntimeError("Envelope service not configured")
            
            # Need prisoner details from Excel manager since they might be sensitive
            from globals import excel_manager
            prisoner_cpid = submission.letter.prisoner_cpid
            prisoner_details = excel_manager.resolve_name_from_cpid(prisoner_cpid)
            
            # Fallback if no details
            if not prisoner_details:
                # Use basic info from DB if possible or error
                if not submission.letter.prisoner:
                    raise ValueError(f"No prisoner record for letter {submission.letter_id}")
                # Minimal dict from ORM
                prisoner_details = {
                    "fName": submission.letter.prisoner.first_name,
                    "lName": submission.letter.prisoner.last_name,
                    "cpid": submission.letter.prisoner.cpid,
                }

            dest = self.envelope_service.generate_envelope(submission.id, prisoner_details)
            media_type = "application/pdf"
        else:
            raise ValueError("Unsupported export format")

        if not sha256:
             sha256 = hashlib.sha256(dest.read_bytes()).hexdigest()

        artifact = SubmissionArtifact(
            submission_id=submission.id,
            version_id=submission.current_version_id,
            artifact_type=fmt,
            storage_backend=self.storage_backend,
            file_path=str(dest),
            file_name=dest.name,
            sha256=sha256,
            created_by=actor_id,
        )
        self.db.add(artifact)
        # Don't commit yet - let the caller handle it
        return artifact, media_type

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _create_version(
        self,
        submission: Submission,
        payload: SubmissionVersionCreate,
        author_id: Optional[int],
        *,
        autosave: bool,
        version_label: Optional[str] = None,
    ) -> SubmissionVersion:
        version = SubmissionVersion(
            submission_id=submission.id,
            author_id=author_id,
            content=payload.content,
            content_format=payload.content_format,
            autosave=autosave,
            version_label=version_label,
        )
        self.db.add(version)
        self.db.flush()
        return version
