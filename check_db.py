import os
import sys
from pathlib import Path

# Add the server directory to sys.path
current_dir = Path(__file__).parent.absolute()
server_dir = current_dir / "server"
sys.path.append(str(server_dir))

from db.session import SessionLocal
from db.models import Prisoner, User

db = SessionLocal()
try:
    p_count = db.query(Prisoner).count()
    u_count = db.query(User).count()
    print(f"DEBUG: Prisoners: {p_count}")
    print(f"DEBUG: Users: {u_count}")
    
    if p_count == 0:
        print("DEBUG: Creating a test prisoner for ingestion...")
        p = Prisoner(
            cpid="TEST-001",
            first_name="Test",
            last_name="Subject",
            facility="CalPOP Lab"
        )
        db.add(p)
        db.commit()
        print("DEBUG: Test prisoner created.")

finally:
    db.close()
