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
from schemas.prisoner import PrisonerCreate
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
    
    # Auto-load last uploaded map into the in-memory Excel vault if it exists.
    # This is memory-only (populates excel_manager.df for lookups/reference)
    # and does NOT touch Postgres -- Postgres is the source of truth as of
    # 09Aug2026, and syncing it here unconditionally on every restart used to
    # mean any in-app edit could be silently overwritten by however old this
    # file happened to be the next time the container restarted for any
    # reason. Pushing Excel data into Postgres is now only ever a deliberate
    # action via POST /api/excel/upload (e.g. after editing this file offline
    # and wanting to bring those changes in) -- never automatic.
    active_map_path = settings.data_root / "active_map.xlsx"
    if active_map_path.exists():
        try:
            print(f"INFO: Found persistent map at {active_map_path}. Auto-loading (memory only, not synced to Postgres)...")
            excel_manager.load_excel(str(active_map_path))
            print(f"SUCCESS: Auto-loaded {len(excel_manager.df)} prisoner records into memory.")
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
@app.post("/api/excel/upload/preview")
async def preview_excel_upload(file: UploadFile = File(...), user=Depends(require_admin)):
    """
    Stage an uploaded Excel file and compute a diff against current Postgres
    data (source of truth as of 09Aug2026), without touching the database or
    the live in-memory Excel vault. Call /api/excel/upload/apply with the
    returned staging_token to actually commit these changes -- a blind
    overwrite-everything-in-the-file upload risked silently clobbering edits
    made directly in the app since the file was last exported.
    """
    import uuid

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")

    try:
        file_bytes = await file.read()

        staging_token = uuid.uuid4().hex
        staging_dir = settings.data_root / "artifacts" / "tmp"
        staging_dir.mkdir(parents=True, exist_ok=True)
        staging_path = staging_dir / f"excel_staging_{staging_token}.xlsx"
        with open(staging_path, "wb") as f:
            f.write(file_bytes)

        # Throwaway manager so the live vault isn't mutated until confirmed.
        preview_manager = ExcelMapManager()
        preview_manager.load_excel(str(staging_path))

        db_session = SessionLocal()
        try:
            diff = preview_manager.diff_with_postgres_prisoners(db_session)
        finally:
            db_session.close()

        return {"staging_token": staging_token, "diff": diff}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/excel/upload/apply")
def apply_excel_upload(payload: dict, user=Depends(require_admin)):
    """
    Commit a previously staged upload (see /api/excel/upload/preview): loads
    it into the live Excel vault, persists it as data/active_map.xlsx, and
    syncs Postgres for real. This is the only place an upload is allowed to
    actually change the database -- deliberately separate from preview.
    """
    staging_token = payload.get("staging_token")
    if not staging_token:
        raise HTTPException(status_code=400, detail="staging_token is required")

    staging_path = settings.data_root / "artifacts" / "tmp" / f"excel_staging_{staging_token}.xlsx"
    if not staging_path.exists():
        raise HTTPException(status_code=404, detail="Staged upload not found or expired -- run preview again")

    try:
        active_map_path = settings.data_root / "active_map.xlsx"
        with open(staging_path, "rb") as src, open(active_map_path, "wb") as dst:
            dst.write(src.read())
        print(f"INFO: Persisted active map to {active_map_path}")

        # Load from the final path, not the staging one, so get_summary()'s
        # file_path reflects where this data actually lives going forward.
        excel_manager.load_excel(str(active_map_path))

        letters_sync_count = excel_manager.sync_with_letter_db(db)

        db_session = SessionLocal()
        try:
            postgres_sync_count = excel_manager.sync_with_postgres_prisoners(db_session)
        finally:
            db_session.close()

        staging_path.unlink(missing_ok=True)

        summary = excel_manager.get_summary()
        summary["synced_letters"] = letters_sync_count
        summary["synced_postgres_prisoners"] = postgres_sync_count

        return {"message": "Upload applied successfully", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/excel/status")
def get_excel_status(user=Depends(require_admin)):
    """Get status of loaded Excel data."""
    return excel_manager.get_summary()

@app.post("/api/prisoners")
def create_prisoner(payload: PrisonerCreate, user=Depends(require_admin)):
    """
    Envelope Mgt's not-found branch: a person who wrote in isn't in the
    roster at all yet. Generates a CPID server-side (random, not derived
    from name/CDCR# -- the legacy core/letter_db.py generator that did that
    has a bug where it can only ever produce 2 real letters from 2 initials,
    padded with 'X', which doesn't match the real CPIDs already in the
    roster) and creates the Prisoner record with whatever PII is known.
    """
    from db.models import Prisoner
    import random

    db = SessionLocal()
    try:
        letters_pool = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I/O -- avoid confusion with 1/0
        digits_pool = "23456789"  # no 0/1 -- avoid confusion with O/I
        cpid = None
        for _ in range(100):
            candidate = "".join(random.choices(letters_pool, k=3)) + "".join(random.choices(digits_pool, k=3))
            if not db.query(Prisoner).filter(Prisoner.cpid == candidate).first():
                cpid = candidate
                break
        if not cpid:
            raise HTTPException(status_code=500, detail="Could not generate a unique CPID")

        prisoner = Prisoner(cpid=cpid, **payload.dict())
        db.add(prisoner)
        db.commit()
        db.refresh(prisoner)

        return {
            "cpid": prisoner.cpid,
            "first_name": prisoner.first_name,
            "last_name": prisoner.last_name,
            "cdcr_number": prisoner.cdcr_number,
            "facility": prisoner.facility,
            "housing": prisoner.housing,
            "address": prisoner.address,
            "city": prisoner.city,
            "state": prisoner.state,
            "zip": prisoner.zip,
            "safety_classification": prisoner.safety_classification,
            "sponsor_name": prisoner.sponsor_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/prisoners")
def list_prisoners(user=Depends(require_admin)):
    """
    Full prisoner roster from Postgres, decrypted -- the "view it completely"
    counterpart to the encrypted-at-rest PII columns. Admin-only. Must be
    registered before /api/prisoners/{cpid} or FastAPI would match this
    path as cpid="export" etc. (route order matters, not just specificity).
    """
    from db.models import Prisoner, Letter
    from sqlalchemy import func

    db = SessionLocal()
    try:
        prisoners = db.query(Prisoner).order_by(Prisoner.cpid).all()

        # Computed, not stored -- always accurate, can't drift out of sync
        # the way a manually-incremented counter could (see implementation_plan.md).
        counts = dict(
            db.query(Letter.prisoner_cpid, func.count(Letter.id))
            .group_by(Letter.prisoner_cpid)
            .all()
        )

        return [
            {
                "cpid": p.cpid,
                "first_name": p.first_name,
                "last_name": p.last_name,
                "cdcr_number": p.cdcr_number,
                "housing": p.housing,
                "facility": p.facility,
                "address": p.address,
                "city": p.city,
                "state": p.state,
                "zip": p.zip,
                "safety_classification": p.safety_classification,
                "sponsor_name": p.sponsor_name,
                "letters_received_count": counts.get(p.cpid, 0),
                "intake_number": p.intake_number,
                "stage": p.stage,
                "cdcr_db_verified": p.cdcr_db_verified,
                "contract_status": p.contract_status,
                "date_of_contract": p.date_of_contract,
                "needs_green_book": p.needs_green_book,
                "language": p.language,
                "review_notes": p.review_notes,
                "date_sponsor_assigned": p.date_sponsor_assigned,
                "letter_exchange_count": p.letter_exchange_count,
                "step_received_count": p.step_received_count,
                "bph_date": p.bph_date,
            }
            for p in prisoners
        ]
    finally:
        db.close()


@app.get("/api/prisoners/export")
def export_prisoners_excel(user=Depends(require_admin)):
    """
    Download the full Postgres prisoner roster as an .xlsx. Lets the program
    manager keep reviewing/auditing this data in Excel even though it's now
    stored encrypted at rest -- the whole point of adding this endpoint.
    """
    import io
    from datetime import datetime
    import pandas as pd
    from fastapi.responses import StreamingResponse
    from db.models import Prisoner

    db = SessionLocal()
    try:
        prisoners = db.query(Prisoner).order_by(Prisoner.cpid).all()
        rows = [
            {
                "CPID": p.cpid,
                "fName": p.first_name,
                "lName": p.last_name,
                "CDCRno": p.cdcr_number,
                "housing": p.housing,
                "facility": p.facility,
                "address": p.address,
                "city": p.city,
                "state": p.state,
                "zip": p.zip,
                "Unsafe?": "Y" if (p.safety_classification or "").strip().lower() == "unsafe" else "",
                "Sponsor": p.sponsor_name,
                "Intake #": p.intake_number,
                "Stage": p.stage,
                "CDCR db verif": p.cdcr_db_verified,
                "contract": p.contract_status,
                "Date of contract": p.date_of_contract,
                "Needs Green book?": p.needs_green_book,
                "language": p.language,
                "Review notes": p.review_notes,
                "Date Sponsor assigned": p.date_sponsor_assigned,
                "letter exchange (received only)": p.letter_exchange_count,
                "Step (received only)": p.step_received_count,
                "BPH DATE": p.bph_date,
            }
            for p in prisoners
        ]
    finally:
        db.close()

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)

    filename = f"prisoner_roster_export_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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
