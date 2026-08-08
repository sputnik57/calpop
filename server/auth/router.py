from datetime import timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from config import get_settings
from .azure import AzureADClient, AzureNotConfigured
from .dependencies import get_current_user
from .models import ROLE_ADMIN, ROLE_AUDITOR, ROLE_SPONSOR, UserContext
from .session import SessionManager
from .state_store import state_store

settings = get_settings()
session_manager = SessionManager(settings)

try:
    azure_client = AzureADClient(settings)
except AzureNotConfigured:
    azure_client = None

router = APIRouter(prefix=f"{settings.api_prefix}/auth", tags=["auth"])


def _ensure_azure_client() -> AzureADClient:
    if not azure_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure AD is not configured on this deployment.",
        )
    return azure_client


def _determine_roles(groups: Optional[List[str]]) -> List[str]:
    roles = set()
    roles.add(settings.default_role or ROLE_SPONSOR)

    if groups:
        group_set = set(groups)
        if any(group in group_set for group in settings.azure_admin_group_ids):
            roles.add(ROLE_ADMIN)
        if any(group in group_set for group in settings.azure_auditor_group_ids):
            roles.add(ROLE_AUDITOR)

    if ROLE_ADMIN in roles:
        roles.add(ROLE_SPONSOR)
        roles.add(ROLE_AUDITOR)

    return list(roles)


def _set_session_cookie(response: Response, token: str) -> None:
    max_age = settings.session_expiry_seconds
    expires = session_manager.expiry_timestamp().astimezone(timezone.utc)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=max_age,
        expires=expires,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        domain=settings.session_cookie_domain,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )


@router.get("/login")
def begin_login(redirect_to: Optional[str] = None):
    client = _ensure_azure_client()
    auth_state = state_store.generate_state(redirect_to=redirect_to)
    auth_url = client.build_authorization_url(auth_state.state)
    return {"authorization_url": auth_url, "state": auth_state.state}


@router.get("/callback")
def complete_login(code: str, state: str, response: Response):
    client = _ensure_azure_client()
    state_record = state_store.consume_state(state)
    if not state_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired state parameter.")

    token_result = client.acquire_token_by_authorization_code(code)
    if "error" in token_result:
        detail = token_result.get("error_description") or token_result["error"]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    claims = token_result.get("id_token_claims", {})
    user_id = claims.get("oid") or claims.get("sub")
    email = claims.get("preferred_username") or claims.get("upn")
    display_name = claims.get("name") or email or "User"
    groups = claims.get("groups", [])

    if not user_id or not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve user identity.")

    roles = _determine_roles(groups)
    payload = {
        "user_id": user_id,
        "email": email,
        "display_name": display_name,
        "roles": roles,
    }

    token = session_manager.create_token(payload)
    redirect_target = state_record.redirect_to or "/"
    redirect_response = RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)
    _set_session_cookie(redirect_response, token)
    return redirect_response


@router.post("/logout")
def logout(response: Response):
    result = JSONResponse({"message": "Logged out"})
    _clear_session_cookie(result)
    return result


@router.get("/me")
def me(user: UserContext = Depends(get_current_user)):
    return {
        "user_id": user.user_id,
        "email": user.email,
        "display_name": user.display_name,
        "roles": user.roles,
    }

@router.get("/dev-login")
def dev_login(role: str = "admin", response: Response = None):
    """
    Development-only login bypass.
    Only works if NOT in production.
    """
    if settings.is_production:
        raise HTTPException(status_code=404, detail="Not available in production")
    
    # Mock user payload
    roles = [ROLE_SPONSOR]
    if role == "admin":
        roles = [ROLE_ADMIN, ROLE_SPONSOR, ROLE_AUDITOR]
    
    payload = {
        "user_id": "dev-user-001",
        "email": "dev@calpop.local",
        "display_name": f"Dev {role.capitalize()}",
        "roles": roles,
    }

    token = session_manager.create_token(payload)
    redirect_response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    _set_session_cookie(redirect_response, token)
    return redirect_response
