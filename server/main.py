from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from typing import List, Optional
import os
import sys
from pathlib import Path

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import get_settings
from core.letter_db import LetterDatabase
from services.excel_manager import ExcelMapManager
from auth.dependencies import require_admin, require_admin_or_sponsor
from auth.middleware import SessionMiddleware
from auth.router import router as auth_router
from auth.session import SessionManager
from api.submissions import router as submissions_router
from api.letters import router as letters_router
from api.assignments import router as assignments_router
from api.library import router as library_router
from api.batch import router as batch_router
from db.session import SessionLocal, get_session
from sqlalchemy.orm import Session
from globals import excel_manager

settings = get_settings()


def ensure_data_directories(base: Path) -> None:
    subdirs = [
        base / "originals" / "letters",
        base / "originals" / "images",
        base / "redacted",
        base / "artifacts" / "ocr",
        base / "artifacts" / "tmp",
        base / "submissions",
    ]
    for path in subdirs:
        path.mkdir(parents=True, exist_ok=True)


ensure_data_directories(settings.data_root)

session_manager = SessionManager(settings)


class StaticDataAuthMiddleware(BaseHTTPMiddleware):
    """
    Guard the raw /api/static/data mount, which serves prisoner scans, the
    roster, and submission/envelope artifacts straight off disk. Starlette's
    StaticFiles mount bypasses FastAPI's route-level Depends() auth entirely,
    so without this, every file under data/ -- including the full prisoner
    roster -- is downloadable by anyone who can reach this port, no login
    required. Requires any authenticated session (admin/sponsor/auditor);
    this closes the "completely unauthenticated" hole but does not yet
    restrict a sponsor to only their own assigned files -- that's a finer
    per-resource authorization gap, tracked separately.
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/static/data"):
            user = getattr(request.state, "user", None)
            if user is None:
                return JSONResponse({"detail": "Authentication required"}, status_code=401)
        return await call_next(request)


app = FastAPI(title="CalPOP API", debug=settings.debug)
# Registered before SessionMiddleware so that, per Starlette's middleware
# ordering (most-recently-added = outermost = runs first), SessionMiddleware
# populates request.state.user BEFORE this guard checks it.
app.add_middleware(StaticDataAuthMiddleware)
app.add_middleware(SessionMiddleware, session_manager=session_manager, settings=settings)
app.include_router(auth_router)
app.include_router(submissions_router, prefix=f"{settings.api_prefix}/submissions")
app.include_router(letters_router, prefix=f"{settings.api_prefix}/letters")
app.include_router(assignments_router, prefix=f"{settings.api_prefix}/assignments")
app.include_router(library_router, prefix=f"{settings.api_prefix}/library")
app.include_router(batch_router, prefix=f"{settings.api_prefix}/batch")

# Static Files for scans/artifacts
# Ensure data_root is absolute for static files
data_dir = settings.data_root.resolve()
app.mount("/api/static/data", StaticFiles(directory=str(data_dir)), name="data")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Legacy Database
legacy_db_path = (settings.data_root / "letters.db").resolve()
db = LetterDatabase(str(legacy_db_path))
# Note: excel_manager is now managed in globals.py

@app.on_event("startup")
async def startup_event():
    print("\n--- Registered Routes ---")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"URL: {route.path}")
    print("-------------------------\n")
    
    # Auto-load last uploaded map if it exists
    active_map_path = settings.data_root / "active_map.xlsx"
    if active_map_path.exists():
        try:
            print(f"INFO: Found persistent map at {active_map_path}. Auto-loading...")
            excel_manager.load_excel(str(active_map_path))
            print(f"SUCCESS: Auto-loaded {len(excel_manager.df)} prisoner records.")
            
            # Sync with Postgres on startup
            db_session = SessionLocal()
            try:
                sync_count = excel_manager.sync_with_postgres_prisoners(db_session)
                print(f"INFO: Synced {sync_count} prisoners to Postgres on startup.")
            finally:
                db_session.close()
                
        except Exception as e:
            print(f"ERROR: Failed to auto-load persistent map: {e}")

class Letter(BaseModel):
    letter_id: int
    prisoner_idx: int
    prisoner_code: str
    processing_status: str
    date_env_letter_scanned: Optional[str] = None
    # Add other fields as needed for the frontend

@app.get("/")
def read_root():
    return {"message": "CalPOP Secure Core Online", "system": "Active"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/health")
def api_health_check():
    return {"status": "healthy"}

# Legacy get_letters removed in favor of new router
# @app.get("/api/letters", response_model=List[dict])
# def get_letters():
#     """
#     Get all letters from the database.
#     """
#     try:
#         letters = db.get_all_letters()
#         return letters
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/program-summary")
def get_program_summary():
    """
    Get program summary statistics from Excel data.
    Active sponsees = Stage 12, Unique sponsors = Stage 2-89.
    """
    try:
        return excel_manager.get_sponsorship_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Excel Management Endpoints
@app.post("/api/excel/upload")
async def upload_excel_map(
    file: UploadFile = File(...),
    user=Depends(require_admin),
    db_postgres: Session = Depends(get_session),
):
    """
    Upload and process Excel prisoner map file.
    This is the core of the Secure Vault - loads sensitive data for ID resolution.
    """
    try:
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
        
        # Read file contents
        file_bytes = await file.read()
        
        # Load into Excel manager
        excel_manager.load_excel_from_bytes(file_bytes, file.filename)
        
        # Persist the file for auto-loading on restart
        active_map_path = settings.data_root / "active_map.xlsx"
        with open(active_map_path, "wb") as f:
            f.write(file_bytes)
        print(f"INFO: Persisted active map to {active_map_path}")
        
        # Sync with letter database (Legacy SQLite)
        sync_count = excel_manager.sync_with_letter_db(db)
        
        # Sync with Postgres (New primary database)
        postgres_sync_count = excel_manager.sync_with_postgres_prisoners(db_postgres)
        
        # Get summary
        summary = excel_manager.get_summary()
        summary["synced_letters"] = sync_count
        summary["synced_postgres_prisoners"] = postgres_sync_count
        
        return {
            "message": "Excel file uploaded and processed successfully",
            "summary": summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/excel/status")
def get_excel_status(user=Depends(require_admin)):
    """Get status of loaded Excel data."""
    return excel_manager.get_summary()

@app.get("/api/prisoners/{cpid}")
def get_prisoner_info(cpid: str, user=Depends(require_admin_or_sponsor)):
    """
    Get prisoner info by CPID (anonymized data only).
    Safe for frontend consumption - no real names or sensitive data.
    """
    try:
        prisoner_data = excel_manager.get_prisoner_by_cpid(cpid)
        if not prisoner_data:
            raise HTTPException(status_code=404, detail="Prisoner not found")
        return prisoner_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prisoners/{cpid}/details")
def get_prisoner_details(cpid: str, user=Depends(require_admin)):
    """
    Get full prisoner details including real name and mailing address.
    Admin-only: sponsors work in CPID space via /api/prisoners/{cpid} (anonymized);
    only the program manager resolves identity to actually answer/mail letters.
    """
    try:
        resolved_data = excel_manager.resolve_name_from_cpid(cpid)
        if not resolved_data:
            # Fallback to anonymized data if no vault record found
            return excel_manager.get_prisoner_by_cpid(cpid) or {"cpid": cpid}
        return resolved_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sponsors")
def get_sponsors(active_only: bool = True, user=Depends(require_admin)):
    """Get list of all sponsors."""
    try:
        sponsors = excel_manager.get_all_sponsors(active_only)
        return {"sponsors": sponsors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sponsors/{sponsor_name}/prisoners")
def get_prisoners_by_sponsor(
    sponsor_name: str,
    active_only: bool = True,
    user=Depends(require_admin),
):
    """Get all prisoners for a specific sponsor (anonymized data)."""
    try:
        prisoners = excel_manager.get_prisoners_by_sponsor(sponsor_name, active_only)
        return {"sponsor": sponsor_name, "prisoners": prisoners}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def get_stats(user=Depends(require_admin)):
    """
    Get dashboard statistics.
    """
    try:
        letters = db.get_all_letters()
        # Simple aggregation
        total = len(letters)
        pending = sum(1 for l in letters if l.get('processing_status') == 'scanned')
        completed = sum(1 for l in letters if l.get('processing_status') == 'finished')
        
        return {
            "total_letters": total,
            "pending_action": pending,
            "completed": completed
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
