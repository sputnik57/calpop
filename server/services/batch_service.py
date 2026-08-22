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

    def process_batch(self, data: BatchLetterCreate, author_id: int, is_admin: bool = False) -> BatchResponse:
        """
        Processes a batch of letters: Creates Letter -> Submission -> Artifacts.
        Finally merges all PDFs for mass printing.

        Envelope PDFs are merged into TWO separate outputs -- safe and unsafe --
        never combined into one file. A prisoner's safety classification decides
        the sender (return) address printed on their envelope; mixing them into
        a single print run defeats the whole point of having the distinction.

        is_admin controls whether sponsor-assignment is required per letter.
        Admin-authored batches (e.g. form "wait letters" to prisoners who have
        no sponsor yet) skip that check, since there's no assignment to have.
        A sponsor running a batch is still required to actually be assigned to
        every prisoner in it -- otherwise batch mode would let a sponsor submit
        correspondence for someone else's assigned sponsee.
        """
        submission_ids = []
        letter_pdf_paths = []
        envelope_pdf_paths_safe = []
        envelope_pdf_paths_unsafe = []

        for cpid in data.prisoner_cpids:
            try:
                # 1. Create Letter
                # Note: "drafting" is not a valid letterstatus enum value (found
                # 09Aug2026 while testing this code path -- pre-existing bug,
                # unrelated to the envelope safe/unsafe work). Batch-authored
                # letters skip physical intake entirely, so "response_started"
                # is the closest correct semantic match.
                l_create = LetterCreate(
                    prisoner_cpid=cpid,
                    title=data.title,
                    intake_source="batch_operation",
                    status="response_started"
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
                submission = self.submission_service.create_submission(
                    sponsor_id=author_id, data=s_create, require_assignment=not is_admin
                )
                submission_ids.append(submission.id)

                # 3. Generate Artifacts (PDF and Envelope)
                # Letter PDF
                artifact_task = self.submission_service.generate_artifact(submission.id, "pdf", actor_id=author_id)
                letter_pdf_paths.append(Path(artifact_task[0].file_path))

                # Envelope PDF -- route into the safe/unsafe bucket by this
                # prisoner's classification, resolved the same way the envelope
                # itself was generated (fail-safe default is "unsafe").
                env_task = self.submission_service.generate_artifact(submission.id, "envelope", actor_id=author_id)
                env_path = Path(env_task[0].file_path)
                prisoner_details = self.submission_service.resolve_prisoner_for_mailing(cpid)
                classification = EnvelopeService.resolve_safety_classification(prisoner_details)
                if classification == "safe":
                    envelope_pdf_paths_safe.append(env_path)
                else:
                    envelope_pdf_paths_unsafe.append(env_path)

                # Added 18Aug2026: this prisoner's envelope was just actually
                # generated, so they're done with the print queue -- whether
                # they got there via a confirmed scan or a manual add.
                from db.models import Prisoner
                prisoner_row = self.db.query(Prisoner).filter(Prisoner.cpid == cpid).first()
                if prisoner_row:
                    prisoner_row.queued_for_printing_at = None
                    self.db.commit()

            except Exception as e:
                print(f"ERROR in batch item {cpid}: {e}")
                continue

        # 4. Merge PDFs for Mass Printing
        batch_id = str(uuid.uuid4())[:8]
        merged_letter_path = None
        merged_env_path_safe = None
        merged_env_path_unsafe = None

        if letter_pdf_paths:
            merged_letter = self.submission_service.artifact_service.merge_pdfs(
                letter_pdf_paths, f"batch_{batch_id}_letters.pdf"
            )
            merged_letter_path = f"/api/static/data/submissions/{merged_letter.name}"

        if envelope_pdf_paths_safe:
            merged_env_safe = self.submission_service.artifact_service.merge_pdfs(
                envelope_pdf_paths_safe, f"batch_{batch_id}_envelopes_safe.pdf"
            )
            merged_env_path_safe = f"/api/static/data/submissions/{merged_env_safe.name}"

        if envelope_pdf_paths_unsafe:
            merged_env_unsafe = self.submission_service.artifact_service.merge_pdfs(
                envelope_pdf_paths_unsafe, f"batch_{batch_id}_envelopes_unsafe.pdf"
            )
            merged_env_path_unsafe = f"/api/static/data/submissions/{merged_env_unsafe.name}"

        return BatchResponse(
            processed_count=len(submission_ids),
            submission_ids=submission_ids,
            merged_pdf_url=merged_letter_path,
            merged_envelope_url_safe=merged_env_path_safe,
            merged_envelope_url_unsafe=merged_env_path_unsafe,
        )
