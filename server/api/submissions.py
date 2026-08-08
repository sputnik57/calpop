from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.deps import get_db, get_db_user
from auth.dependencies import require_admin_or_sponsor
from auth.models import ROLE_ADMIN, ROLE_SPONSOR, UserContext
from schemas.submission import (
    SubmissionCreate,
    SubmissionOut,
    SubmissionReview,
    SubmissionUpdate,
    SubmissionVersionCreate,
)
from services.artifact_service import SubmissionArtifactService
from services.submission_service import SubmissionService

router = APIRouter(tags=["submissions"])


def _service(db: Session) -> SubmissionService:
    storage_root = Path("data/submissions")
    storage_root.mkdir(parents=True, exist_ok=True)
    artifact_service = SubmissionArtifactService(storage_root)
    
    from services.envelope_service import EnvelopeService
    envelope_service = EnvelopeService(storage_root)
    
    return SubmissionService(
        db, 
        artifact_service=artifact_service, 
        envelope_service=envelope_service,
        storage_backend="local"
    )


@router.post("", response_model=SubmissionOut)
def create_submission(
    payload: SubmissionCreate,
    user: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    try:
        submission = service.create_submission(sponsor_id=db_user.id, data=payload)
        return submission
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/mine", response_model=List[SubmissionOut])
def list_my_submissions(
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    submissions = service.list_submissions_for_sponsor(db_user.id)
    return submissions


@router.post("/{submission_id}/autosave", response_model=SubmissionOut)
def autosave_submission(
    submission_id: int,
    payload: SubmissionVersionCreate,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    if ROLE_SPONSOR not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sponsor role required")
    service = _service(db)
    try:
        return service.autosave(submission_id, payload, sponsor_id=db_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{submission_id}/submit", response_model=SubmissionOut)
def submit_submission(
    submission_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    if ROLE_SPONSOR not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sponsor role required")
    service = _service(db)
    try:
        return service.submit_submission(submission_id, sponsor_id=db_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{submission_id}/request-revisions", response_model=SubmissionOut)
def request_revisions(
    submission_id: int,
    payload: SubmissionReview,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    if ROLE_ADMIN not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    service = _service(db)
    return service.request_revisions(submission_id, reviewer_id=db_user.id, payload=payload)


@router.post("/{submission_id}/approve", response_model=SubmissionOut)
def approve_submission(
    submission_id: int,
    payload: SubmissionReview,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    if ROLE_ADMIN not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    service = _service(db)
    return service.approve_submission(submission_id, reviewer_id=db_user.id, payload=payload)


@router.get("", response_model=List[SubmissionOut])
def list_submissions(
    statuses: Optional[List[str]] = Query(default=None),
    sponsor_id: Optional[int] = None,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    if ROLE_ADMIN not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    service = _service(db)
    return service.list_submissions(statuses=statuses, sponsor_id=sponsor_id)


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    submission_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    submission = service._get_submission(submission_id)  # noqa: SLF001
    if ROLE_ADMIN not in user_context.roles and submission.sponsor_id != db_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view submission")
    return submission


@router.put("/{submission_id}", response_model=SubmissionOut)
def update_submission(
    submission_id: int,
    updates: SubmissionUpdate,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    try:
        submission = service.update_submission(
            submission_id,
            updates,
            sponsor_id=db_user.id if ROLE_SPONSOR in user_context.roles else None,
            reviewer_id=db_user.id if ROLE_ADMIN in user_context.roles else None,
        )
        return submission
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{submission_id}/artifacts/{fmt}")
def generate_artifact(
    submission_id: int,
    fmt: str,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    if ROLE_ADMIN not in user_context.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    service = _service(db)
    try:
        artifact, media_type = service.generate_artifact(submission_id, fmt, actor_id=db_user.id)
        return {"artifact_id": artifact.id, "file_name": artifact.file_name, "media_type": media_type}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
