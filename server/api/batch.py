from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pathlib import Path

from api.deps import get_db, get_db_user
from auth.dependencies import require_admin_or_sponsor
from auth.models import ROLE_ADMIN, UserContext
from schemas.batch import BatchLetterCreate, BatchResponse
from services.batch_service import BatchService
from services.letter_service import LetterService
from services.submission_service import SubmissionService
from services.artifact_service import SubmissionArtifactService
from services.envelope_service import EnvelopeService

router = APIRouter(tags=["batch"])

def _batch_service(db: Session) -> BatchService:
    # Manual DI because of complex dependencies
    storage_root = Path("data/submissions")
    storage_root.mkdir(parents=True, exist_ok=True)
    
    art_service = SubmissionArtifactService(storage_root)
    env_service = EnvelopeService(storage_root)
    
    sub_service = SubmissionService(
        db, 
        artifact_service=art_service, 
        envelope_service=env_service,
        storage_backend="local"
    )
    let_service = LetterService(db)
    
    return BatchService(db, let_service, sub_service, env_service)

@router.post("/letters", response_model=BatchResponse)
def create_batch_letters(
    payload: BatchLetterCreate,
    user: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user = Depends(get_db_user)
):
    service = _batch_service(db)
    try:
        return service.process_batch(payload, author_id=db_user.id, is_admin=user.has_role(ROLE_ADMIN))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
