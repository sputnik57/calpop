import pytest
from datetime import datetime, timedelta

from schemas.assignment import AssignmentCreate
from services.assignment_service import AssignmentService

def test_create_assignment(db_session, prisoner, sponsor_user, admin_user):
    from services.letter_service import LetterService
    from schemas.letter import LetterCreate
    
    # Setup letter
    ls = LetterService(db_session)
    letter = ls.create_letter(LetterCreate(prisoner_cpid=prisoner.cpid), author_id=admin_user.id)
    
    # Test Assignment
    service = AssignmentService(db_session)
    data = AssignmentCreate(
        letter_id=letter.id,
        sponsor_id=sponsor_user.id,
        prisoner_cpid=prisoner.cpid,
        notes="Test assignment",
        due_date=datetime.utcnow() + timedelta(days=7)
    )
    
    assignment = service.create_assignment(data, assigned_by=admin_user.id)
    
    assert assignment.id is not None
    assert assignment.sponsor_id == sponsor_user.id
    assert assignment.letter_id == letter.id
    assert assignment.assigned_by == admin_user.id

def test_list_assignments(db_session, prisoner, sponsor_user, admin_user):
    service = AssignmentService(db_session)
    # Assume assignment created in previous step or create new
    # For isolation, recreate
    from services.letter_service import LetterService
    from schemas.letter import LetterCreate
    ls = LetterService(db_session)
    letter = ls.create_letter(LetterCreate(prisoner_cpid=prisoner.cpid), author_id=admin_user.id)
    
    data = AssignmentCreate(
        letter_id=letter.id,
        sponsor_id=sponsor_user.id,
        prisoner_cpid=prisoner.cpid
    )
    service.create_assignment(data, assigned_by=admin_user.id)
    
    # Test filters
    my_assignments = service.list_assignments(sponsor_id=sponsor_user.id)
    assert len(my_assignments) == 1
    
    other_assignments = service.list_assignments(sponsor_id=999)
    assert len(other_assignments) == 0
