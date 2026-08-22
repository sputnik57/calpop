from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from api.deps import get_db
from auth.dependencies import require_admin
from auth.models import UserContext
from config import get_settings
from db.models import User
from services import onedrive_service

router = APIRouter(tags=["integrations"])
settings = get_settings()

# In-memory CSRF state store for the OAuth round-trip -- short-lived (a
# handful of minutes, one admin at a time in practice) and this app runs
# as a single backend process, so a plain module dict is sufficient; no
# need for a DB table or Redis just for this.
_pending_states: set[str] = set()


@router.get("/login")
def login(_admin: UserContext = Depends(require_admin)):
    if not settings.onedrive_client_id or not settings.onedrive_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OneDrive integration is not configured (ONEDRIVE_CLIENT_ID/ONEDRIVE_REDIRECT_URI missing).",
        )
    state = onedrive_service.generate_state()
    _pending_states.add(state)
    return RedirectResponse(onedrive_service.build_authorize_url(settings, state))


@router.get("/callback")
def callback(
    request: Request,
    db: Session = Depends(get_db),
    user_context: UserContext = Depends(require_admin),
):
    params = request.query_params
    error = params.get("error")
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OneDrive authorization failed: {error} -- {params.get('error_description', '')}",
        )

    state = params.get("state")
    if not state or state not in _pending_states:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OAuth state.")
    _pending_states.discard(state)

    code = params.get("code")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing authorization code.")

    # connected_by is a best-effort attribution, not load-bearing -- don't
    # let a missing/unprovisioned User row (a known gap for dev-login
    # sessions) block completing the OAuth flow itself.
    db_user = db.query(User).filter(User.email == user_context.email).first()
    conn = onedrive_service.exchange_code_for_tokens(
        settings, db, code, connected_by=db_user.id if db_user else None
    )
    # Land back on the frontend's Sponsors/Settings area rather than
    # returning raw JSON from a browser redirect flow.
    return RedirectResponse(url="/sponsors?onedrive=connected")


@router.get("/status")
def connection_status(
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    conn = onedrive_service.get_connection_status(db)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "account_email": conn.account_email,
        "connected_at": conn.connected_at,
    }


@router.post("/disconnect")
def disconnect(
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    onedrive_service.disconnect(db)
    return {"connected": False}
