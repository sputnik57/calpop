
import sys
import os
from datetime import datetime, timedelta

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db.session import SessionLocal
from db.models import User, Prisoner, Letter, Assignment
from services.excel_manager import ExcelMapManager

def seed_data():
    db = SessionLocal()
    try:
        print("--- Seeding Dev Data ---")

        # 1. Create Dev User (Sponsor)
        email = "dev@calpop.local"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                display_name="Dev Sponsor",
                role="sponsor",
                status="active"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created User: {user.email} (ID: {user.id})")
        else:
            print(f"User exists: {user.email} (ID: {user.id})")
            # Update role to ensure fields for testing
            user.role = "sponsor"
            db.commit()

        # 2. Create Prisoner
        cpid = "DEV001"
        prisoner = db.query(Prisoner).filter(Prisoner.cpid == cpid).first()
        if not prisoner:
            prisoner = Prisoner(
                cpid=cpid,
                first_name="Dev",
                last_name="Prisoner",
                facility="San Quentin",
                safety_classification="safe"
            )
            db.add(prisoner)
            db.commit()
            print(f"Created Prisoner: {cpid}")
        else:
            print(f"Prisoner exists: {cpid}")

        # 3. Create Letter
        # We need a letter related to this prisoner
        letter = db.query(Letter).filter(Letter.prisoner_cpid == cpid).first()
        if not letter:
            letter = Letter(
                prisoner_cpid=cpid,
                original_file_path="data/originals/letters/demo_letter.pdf",  # Dummy path
                status="intake"
            )
            # Create a dummy version for content
            from db.models import LetterVersion
            # Add after commit to get ID
            db.add(letter)
            db.commit()
            db.refresh(letter)
            
            # Add fake content version
            lv = LetterVersion(
                letter_id=letter.id,
                content="Dear Sponsor,\n\nThis is a test letter for development purposes.\n\nSincerely,\nDev Prisoner",
                content_format="markdown",
                version_label="OCR",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(lv)
            db.commit()
            
            # Update latest version
            letter.latest_version_id = lv.id
            db.commit()
            print(f"Created Letter: {letter.id}")
        else:
            print(f"Letter exists: {letter.id}")

        # 4. Create Assignment
        assignment = db.query(Assignment).filter(
            Assignment.letter_id == letter.id, 
            Assignment.sponsor_id == user.id
        ).first()

        if not assignment:
            assignment = Assignment(
                letter_id=letter.id,
                sponsor_id=user.id,
                prisoner_cpid=cpid,
                assigned_at=datetime.utcnow(),
                due_date=datetime.utcnow() + timedelta(days=7)
            )
            db.add(assignment)
            db.commit()
            print(f"Created Assignment: {assignment.id}")
        else:
            print(f"Assignment exists: {assignment.id}")

        print("--- Seeding Complete ---")

    except Exception as e:
        print(f"Seeding Failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
