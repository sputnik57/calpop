from datetime import datetime, timedelta, timezone
from typing import Optional

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import Settings


class SessionManager:
    """Handles signing and validating user session cookies."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.serializer = URLSafeTimedSerializer(
            secret_key=settings.cookie_secret,
            salt="calpop-session",
        )

    def create_token(self, payload: dict) -> str:
        """Return a signed session token for the supplied payload."""
        return self.serializer.dumps(payload)

    def read_token(self, token: str) -> Optional[dict]:
        """Return the payload encoded in the token or None if invalid/expired."""
        max_age = self.settings.session_expiry_seconds
        try:
            return self.serializer.loads(token, max_age=max_age)
        except SignatureExpired:
            return None
        except BadSignature:
            return None

    def expiry_timestamp(self) -> datetime:
        """Return the timestamp when a new session should expire."""
        return datetime.now(timezone.utc) + timedelta(seconds=self.settings.session_expiry_seconds)
