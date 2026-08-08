from typing import List, Dict, Any, Optional
import uuid
from pathlib import Path
from sqlalchemy.orm import Session

from services.letter_service import LetterService
from services.submission_service import SubmissionService
from services.envelope_service import EnvelopeService
from schemas.letter import LetterCreate
from schemas.submission import SubmissionCreate
from schemas.batch import BatchLetterCreate, BatchResponse

class BatchService:
    def __init__(
        self, 
        db: Session,
        letter_service: LetterService,
        submission_service: SubmissionService,
        envelope_service: EnvelopeService
    ):
        self.db = db
        self.letter_service = letter_service
        self.submission_service = submission_service
        self.envelope_service = envelope_service

    def process_batch(self, data: BatchLetterCreate, author_id: int) -> BatchResponse:
        """
        Processes a batch of letters: Creates Letter -> Assignment -> Submission -> Artifacts.
        Finally merges all PDFs for mass printing.
        """
        submission_ids = []
        letter_pdf_paths = []
        envelope_pdf_paths = []

        from globals import excel_manager

        for cpid in data.prisoner_cpids:
            try:
                # 1. Create Letter
                l_create = LetterCreate(
                    prisoner_cpid=cpid,
                    title=data.title,
                    intake_source="batch_operation",
                    status="drafting"
                )
                letter = self.letter_service.create_letter(l_create, author_id=author_id)

                # 2. Create Submission (which also handles assignment validation)
                s_create = SubmissionCreate(
                    letter_id=letter.id,
                    title=f"Bulk: {data.title}",
                    content=data.content,
                    content_format=data.content_format,
                    status="submitted"
                )
                submission = self.submission_service.create_submission(sponsor_id=author_id, data=s_create)
                submission_ids.append(submission.id)

                # 3. Generate Artifacts (PDF and Envelope)
                # Letter PDF
                artifact_task = self.submission_service.generate_artifact(submission.id, "pdf", actor_id=author_id)
                letter_pdf_paths.append(Path(artifact_task[0].file_path))

                # Envelope PDF
                env_task = self.submission_service.generate_artifact(submission.id, "envelope", actor_id=author_id)
                envelope_pdf_paths.append(Path(env_task[0].file_path))

            except Exception as e:
                print(f"ERROR in batch item {cpid}: {e}")
                continue

        # 4. Merge PDFs for Mass Printing
        batch_id = str(uuid.uuid4())[:8]
        merged_letter_path = None
        merged_env_path = None

        if letter_pdf_paths:
            merged_letter = self.submission_service.artifact_service.merge_pdfs(
                letter_pdf_paths, f"batch_{batch_id}_letters.pdf"
            )
            merged_letter_path = f"/api/static/data/submissions/{merged_letter.name}"

        if envelope_pdf_paths:
            merged_env = self.submission_service.artifact_service.merge_pdfs(
                envelope_pdf_paths, f"batch_{batch_id}_envelopes.pdf"
            )
            merged_env_path = f"/api/static/data/submissions/{merged_env.name}"

        return BatchResponse(
            processed_count=len(submission_ids),
            submission_ids=submission_ids,
            merged_pdf_url=merged_letter_path,
            merged_envelope_url=merged_env_path
        )
