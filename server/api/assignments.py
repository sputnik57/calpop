from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.deps import get_db, get_db_user
from auth.dependencies import require_admin, require_admin_or_sponsor
from auth.models import ROLE_ADMIN, UserContext
from schemas.assignment import AssignmentCreate, AssignmentOut
from services.assignment_service import AssignmentService

router = APIRouter(tags=["assignments"])


def _service(db: Session) -> AssignmentService:
    return AssignmentService(db)


@router.post("", response_model=AssignmentOut)
def create_assignment(
    payload: AssignmentCreate,
    user_context: UserContext = Depends(require_admin),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    try:
        return service.create_assignment(payload, assigned_by=db_user.id)
    except Exception as e:
        # Catch DB constraint errors etc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=List[AssignmentOut])
def list_assignments(
    sponsor_id: Optional[int] = None,
    letter_id: Optional[int] = None,
    prisoner_cpid: Optional[str] = None,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
    db_user=Depends(get_db_user),
):
    service = _service(db)
    
    # Security: Sponsors can only see their own assignments
    if ROLE_ADMIN not in user_context.roles:
        if sponsor_id and sponsor_id != db_user.id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view other sponsors' assignments")
        sponsor_id = db_user.id

    return service.list_assignments(sponsor_id=sponsor_id, letter_id=letter_id, prisoner_cpid=prisoner_cpid)


@router.get("/{assignment_id}", response_model=AssignmentOut)
def get_assignment(
    assignment_id: int,
    user_context: UserContext = Depends(require_admin_or_sponsor),
    db: Session = Depends(get_db),
):
    service = _service(db)
    assignment = service.get_assignment(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment

