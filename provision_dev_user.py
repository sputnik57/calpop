import os
import sys
from pathlib import Path

# Add the server directory to sys.path so we can import localized modules
current_dir = Path(__file__).parent.absolute()
server_dir = current_dir / "server"
sys.path.append(str(server_dir))

try:
    from db.session import SessionLocal
    from db.models import User
    
    db = SessionLocal()
    dev_email = "dev@calpop.local"
    
    u = db.query(User).filter(User.email == dev_email).first()
    if not u:
        new_user = User(
            email=dev_email,
            display_name="Dev Admin",
            role="admin",
            status="active"
        )
        db.add(new_user)
        db.commit()
        print(f"SUCCESS: User {dev_email} provisioned as Admin!")
    else:
        print(f"INFO: User {dev_email} already exists in the database.")
        
except Exception as e:
    print(f"ERROR: Could not provision user. {str(e)}")
    print("\nTroubleshooting tips:")
    print("1. Make sure your 'calpop' mamba environment is active.")
    print("2. Make sure your Postgres database is running (docker compose up -d db).")
finally:
    if 'db' in locals():
        db.close()
