
import pytest
from datetime import datetime
from services.submission_service import SubmissionService
from services.letter_service import LetterService
from services.assignment_service import AssignmentService
from schemas.submission import SubmissionCreate, SubmissionVersionCreate, SubmissionReview, SubmissionUpdate
from db.models import Submission, SubmissionVersion, Assignment, Letter, User, Prisoner

# Mock data
SPONSOR_EMAIL = "sponsor@example.com"
PRISONER_CPID = "T12345"

@pytest.fixture
def letter_service(db_session):
    return LetterService(db_session)

@pytest.fixture
def assignment_service(db_session):
    return AssignmentService(db_session)

@pytest.fixture
def submission_service(db_session):
    return SubmissionService(db_session)

@pytest.fixture
def setup_assignment(db_session, letter_service, assignment_service):
    # 1. Create Sponsor
    sponsor = User(email=SPONSOR_EMAIL, display_name="Test Sponsor", role="sponsor")
    db_session.add(sponsor)
    
    # 2. Create Prisoner (with unique CPID to avoid clashes if DB persists, though it's in-memory SQLite usually)
    # Actually conftest uses in-memory sqlite, so clean each time.
    prisoner = Prisoner(cpid=PRISONER_CPID, first_name="Test", last_name="Inmate")
    db_session.add(prisoner)
    
    # 3. Create Letter
    # We create manually to avoid service complexity with file upload simulation
    letter = Letter(prisoner_cpid=PRISONER_CPID, status="intake")
    db_session.add(letter)
    db_session.commit()
    
    # 4. Assign Letter
    assignment = Assignment(
        letter_id=letter.id,
        sponsor_id=sponsor.id,
        prisoner_cpid=PRISONER_CPID,
        assigned_at=datetime.utcnow()
    )
    db_session.add(assignment)
    db_session.commit()
    
    return {"sponsor": sponsor, "letter": letter, "assignment": assignment}


def test_submission_lifecycle(submission_service, setup_assignment, db_session):
    data = setup_assignment
    sponsor_id = data["sponsor"].id
    letter_id = data["letter"].id
    
    # 1. Create Draft
    create_payload = SubmissionCreate(
        letter_id=letter_id,
        title="My Response",
        content="Draft content...",
        content_format="markdown",
        status="draft"
    )
    submission = submission_service.create_submission(sponsor_id, create_payload)
    
    assert submission.id is not None
    assert submission.status == "draft"
    assert submission.current_version.content == "Draft content..."
    assert submission.title == "My Response"
    
    # 2. Autosave
    autosave_payload = SubmissionVersionCreate(
        content="Draft content... autosaved",
        content_format="markdown",
        autosave=True
    )
    submission = submission_service.autosave(submission.id, autosave_payload, sponsor_id=sponsor_id)
    assert submission.autosave_version.content == "Draft content... autosaved"
    assert submission.content == "Draft content... autosaved"
    # Note: Logic on current_version vs autosave_version:
    # create_submission sets current_version. 
    # autosave sets autosave_version BUT also updates 'content' column on submission table for quick access.
    # It does NOT update current_version_id (that points to last committed version).
    assert submission.current_version.content == "Draft content..." 
    
    # 3. Submit
    # First update "real" content to match final draft (user clicks Save or Submit payload includes content)
    # The service update_submission creates a new version if content is provided.
    update_payload = SubmissionUpdate(
        content="Final content ready for review",
        status="draft" 
    )
    submission = submission_service.update_submission(submission.id, update_payload, sponsor_id=sponsor_id)
    assert submission.content == "Final content ready for review"
    assert submission.current_version.content == "Final content ready for review"
    
    # Then change status to submitted
    submission = submission_service.submit_submission(submission.id, sponsor_id)
    assert submission.status == "submitted"
    assert submission.submitted_at is not None
    
    # 4. Request Revisions (Admin)
    admin_id = 999 
    # Create fake admin user to satisfy FK if needed, or if SQLite ignores FKs (it usually enforces).
    admin = User(id=999, email="admin@calpop.org", display_name="Admin", role="admin")
    db_session.add(admin)
    db_session.commit()
    
    review_payload = SubmissionReview(comment="Please remove personal address")
    submission = submission_service.request_revisions(submission.id, admin_id, review_payload)
    
    assert submission.status == "revisions_requested"
    assert submission.revision_comment == "Please remove personal address"
    
    # 5. Re-Submit
    update_payload_2 = SubmissionUpdate(
        content="Final content fixed",
        status="submitted" # Update status directly in update call
    )
    submission = submission_service.update_submission(submission.id, update_payload_2, sponsor_id=sponsor_id)
    assert submission.status == "submitted"
    assert submission.content == "Final content fixed"
    
    # 6. Approve
    approve_payload = SubmissionReview(comment="Looks good")
    submission = submission_service.approve_submission(submission.id, admin_id, approve_payload)
    
    assert submission.status == "approved"
    assert submission.approved_at is not None
