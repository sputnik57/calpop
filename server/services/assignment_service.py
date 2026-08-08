from typing import List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload

from db.models import Assignment, Letter
from schemas.assignment import AssignmentCreate


class AssignmentService:
    def __init__(self, db: Session):
        self.db = db

    def create_assignment(self, data: AssignmentCreate, assigned_by: Optional[int]) -> Assignment:
        assignment = Assignment(
            letter_id=data.letter_id,
            sponsor_id=data.sponsor_id,
            prisoner_cpid=data.prisoner_cpid,
            assigned_by=assigned_by,
            notes=data.notes,
            due_date=data.due_date
        )
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def _query(self):
        return self.db.query(Assignment).options(
            selectinload(Assignment.letter).selectinload(Letter.latest_version),
            selectinload(Assignment.prisoner),
            selectinload(Assignment.sponsor),
            selectinload(Assignment.active_submission)
        )

    def list_assignments(
        self,
        sponsor_id: Optional[int] = None,
        letter_id: Optional[int] = None,
        prisoner_cpid: Optional[str] = None
    ) -> List[Assignment]:
        query = self._query()
        
        if sponsor_id:
            query = query.filter(Assignment.sponsor_id == sponsor_id)
        if letter_id:
            query = query.filter(Assignment.letter_id == letter_id)
        if prisoner_cpid:
            query = query.filter(Assignment.prisoner_cpid == prisoner_cpid)
            
        return query.order_by(desc(Assignment.assigned_at)).all()

    def get_assignment(self, assignment_id: int) -> Optional[Assignment]:
        return self._query().filter(Assignment.id == assignment_id).first()

