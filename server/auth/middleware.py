from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from config import Settings
from .models import UserContext
from .session import SessionManager


class SessionMiddleware(BaseHTTPMiddleware):
    """Attach authenticated user context to each request if a valid session cookie is present."""

    def __init__(self, app, session_manager: SessionManager, settings: Settings):
        super().__init__(app)
        self.session_manager = session_manager
        self.settings = settings

    async def dispatch(self, request: Request, call_next):
        request.state.user = None
        token = request.cookies.get(self.settings.session_cookie_name)
        if token:
            payload = self.session_manager.read_token(token)
            if payload:
                user = self._payload_to_user(payload)
                if user:
                    request.state.user = user
        response: Response = await call_next(request)
        return response

    @staticmethod
    def _payload_to_user(payload: dict) -> Optional[UserContext]:
        user_id = payload.get("user_id")
        email = payload.get("email")
        display_name = payload.get("display_name") or email or "User"
        roles = payload.get("roles") or []
        if not user_id or not email:
            return None
        return UserContext(
            user_id=user_id,
            email=email,
            display_name=display_name,
            roles=roles,
        )
