"""
Microsoft Graph API integration for the single OneDrive account CalPOP
uploads redacted letters to (Rey's own personal Microsoft account, per his
choice -- see implementation_plan.md). Delegated auth (authorization code
flow), not app-only -- this deployment's specific decision, not a CalPOP
requirement (see services/storage_service.py's module docstring for why
that distinction is deliberate).

Owns two things:
  - The OAuth dance (build the login URL, exchange the code, refresh the
    access token) and persisting the resulting tokens via OneDriveConnection.
  - `OneDriveStorageService`, a real implementation of the `StorageService`
    interface (services/storage_service.py) against the Graph API.
"""

import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from config import Settings
from db.models import OneDriveConnection
from services.storage_service import StorageService, StorageItem

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Tokens expire in ~1hr; refresh a little early to avoid a request racing
# expiry mid-call.
_EXPIRY_SAFETY_MARGIN = timedelta(minutes=2)


class OneDriveAuthError(Exception):
    """Raised when there's no usable connection (never connected, or the
    refresh token itself was revoked/expired -- requires re-running the
    login flow, not just retrying)."""


def build_authorize_url(settings: Settings, state: str) -> str:
    params = {
        "client_id": settings.onedrive_client_id,
        "response_type": "code",
        "redirect_uri": str(settings.onedrive_redirect_uri),
        "response_mode": "query",
        "scope": " ".join(settings.onedrive_scopes),
        "state": state,
    }
    return f"{settings.onedrive_authority}/oauth2/v2.0/authorize?{urlencode(params)}"


def generate_state() -> str:
    return secrets.token_urlsafe(24)


def exchange_code_for_tokens(settings: Settings, db: Session, code: str, connected_by: Optional[int]) -> OneDriveConnection:
    """Called from the OAuth callback. Exchanges the one-time code for an
    access+refresh token pair, fetches the connected account's email for
    display, and persists it as the (single) OneDriveConnection row."""
    resp = httpx.post(
        f"{settings.onedrive_authority}/oauth2/v2.0/token",
        data={
            "client_id": settings.onedrive_client_id,
            "client_secret": settings.onedrive_client_secret,
            "code": code,
            "redirect_uri": str(settings.onedrive_redirect_uri),
            "grant_type": "authorization_code",
            "scope": " ".join(settings.onedrive_scopes),
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return _store_tokens(settings, db, resp.json(), connected_by)


def _store_tokens(settings: Settings, db: Session, token_response: dict, connected_by: Optional[int]) -> OneDriveConnection:
    access_token = token_response["access_token"]
    refresh_token = token_response.get("refresh_token")
    expires_at = datetime.utcnow() + timedelta(seconds=token_response.get("expires_in", 3600))

    account_email = None
    try:
        me = httpx.get(
            f"{GRAPH_BASE}/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
        if me.status_code == 200:
            account_email = me.json().get("userPrincipalName") or me.json().get("mail")
    except httpx.HTTPError:
        pass  # display-only; don't fail the connection over it

    conn = db.query(OneDriveConnection).first()
    if not conn:
        conn = OneDriveConnection()
        db.add(conn)

    conn.account_email = account_email
    conn.access_token = access_token
    if refresh_token:
        conn.refresh_token = refresh_token
    conn.access_token_expires_at = expires_at
    conn.connected_by = connected_by
    conn.connected_at = datetime.utcnow()
    db.commit()
    db.refresh(conn)
    return conn


def get_connection_status(db: Session) -> Optional[OneDriveConnection]:
    return db.query(OneDriveConnection).first()


def disconnect(db: Session) -> None:
    conn = db.query(OneDriveConnection).first()
    if conn:
        db.delete(conn)
        db.commit()


def _get_valid_access_token(settings: Settings, db: Session) -> str:
    conn = db.query(OneDriveConnection).first()
    if not conn or not conn.refresh_token:
        raise OneDriveAuthError(
            "OneDrive is not connected -- an admin needs to complete the login "
            "flow at /api/integrations/onedrive/login first."
        )

    if conn.access_token and conn.access_token_expires_at and \
            conn.access_token_expires_at - _EXPIRY_SAFETY_MARGIN > datetime.utcnow():
        return conn.access_token

    resp = httpx.post(
        f"{settings.onedrive_authority}/oauth2/v2.0/token",
        data={
            "client_id": settings.onedrive_client_id,
            "client_secret": settings.onedrive_client_secret,
            "refresh_token": conn.refresh_token,
            "grant_type": "refresh_token",
            "scope": " ".join(settings.onedrive_scopes),
        },
        timeout=30.0,
    )
    if resp.status_code != 200:
        raise OneDriveAuthError(
            f"OneDrive refresh token was rejected (HTTP {resp.status_code}) -- "
            "the connection needs to be re-authorized via /api/integrations/onedrive/login."
        )
    conn = _store_tokens(settings, db, resp.json(), conn.connected_by)
    return conn.access_token


class OneDriveStorageService(StorageService):
    """Graph API implementation of StorageService. Paths are logical,
    slash-separated, relative to `settings.onedrive_root_folder_id` (or the
    drive root if unset) -- e.g. "SponsorName/exchange3" -- exactly like
    LocalStorageService, so Letter Mgt code never has to branch on which
    backend is live."""

    def __init__(self, settings: Settings, db: Session):
        self.settings = settings
        self.db = db

    def _headers(self) -> dict:
        token = _get_valid_access_token(self.settings, self.db)
        return {"Authorization": f"Bearer {token}"}

    def _item_url(self, path: str = "") -> str:
        root = self.settings.onedrive_root_folder_id
        base = f"{GRAPH_BASE}/me/drive/items/{root}" if root else f"{GRAPH_BASE}/me/drive/root"
        if not path:
            return base
        return f"{base}:/{path}:"

    def create_folder(self, path: str) -> str:
        parent, _, name = path.rpartition("/")
        resp = httpx.post(
            f"{self._item_url(parent)}/children",
            headers=self._headers(),
            json={
                "name": name,
                "folder": {},
                "@microsoft.graph.conflictBehavior": "replace",
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def upload_file(self, folder_path: str, filename: str, content: bytes) -> str:
        # Simple upload (<4MB) -- fine for redacted letter scans; a
        # resumable-upload session would be needed for anything larger.
        target = f"{folder_path}/{filename}" if folder_path else filename
        resp = httpx.put(
            f"{self._item_url(target)}/content",
            headers={**self._headers(), "Content-Type": "application/octet-stream"},
            content=content,
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def list_folder(self, path: str) -> List[StorageItem]:
        resp = httpx.get(f"{self._item_url(path)}/children", headers=self._headers(), timeout=30.0)
        if resp.status_code == 404:
            raise FileNotFoundError(f"No such folder: {path!r}")
        resp.raise_for_status()
        items = []
        for entry in resp.json().get("value", []):
            items.append(StorageItem(
                name=entry["name"],
                ref=entry["id"],
                is_folder="folder" in entry,
                size=entry.get("size"),
                modified_at=datetime.fromisoformat(entry["lastModifiedDateTime"].replace("Z", "+00:00"))
                if entry.get("lastModifiedDateTime") else None,
            ))
        return items

    def download_file(self, ref: str) -> bytes:
        # Graph API's /content endpoint 302s to a signed, pre-authenticated
        # SharePoint download URL -- follow_redirects is required, and the
        # Graph bearer token must NOT be forwarded to that second host.
        resp = httpx.get(
            f"{GRAPH_BASE}/me/drive/items/{ref}/content",
            headers=self._headers(),
            timeout=60.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
        return resp.content
