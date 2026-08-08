import pytest
from datetime import datetime

from schemas.letter import LetterCreate, LetterUpdate
from services.letter_service import LetterService

def test_create_letter(db_session, prisoner, admin_user):
    service = LetterService(db_session)
    data = LetterCreate(
        prisoner_cpid=prisoner.cpid,
        title="Test Letter",
        status="intake",
        content_format="markdown"
    )
    letter = service.create_letter(data, author_id=admin_user.id)
    
    assert letter.id is not None
    assert letter.title == "Test Letter"
    assert letter.prisoner_cpid == prisoner.cpid
    assert letter.created_by == admin_user.id
    assert letter.status == "intake"

def test_add_version(db_session, prisoner, admin_user):
    service = LetterService(db_session)
    # Create initial letter
    data = LetterCreate(prisoner_cpid=prisoner.cpid)
    letter = service.create_letter(data, author_id=admin_user.id)
    
    # Add version
    updated = service.add_version(letter.id, "New content", admin_user.id)
    
    assert len(updated.versions) == 1
    assert updated.latest_version_id == updated.versions[0].id
    assert updated.versions[0].content == "New content"
    assert updated.versions[0].version_label == "v1"

def test_update_letter(db_session, prisoner, admin_user):
    service = LetterService(db_session)
    letter = service.create_letter(LetterCreate(prisoner_cpid=prisoner.cpid), author_id=admin_user.id)
    
    updates = LetterUpdate(title="Updated Title", status="scanned")
    updated = service.update_letter(letter.id, updates)
    
    assert updated.title == "Updated Title"
    assert updated.status == "scanned"
