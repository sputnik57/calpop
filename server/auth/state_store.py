import secrets
import time
from typing import Dict, Optional

from .models import AuthState


class OAuthStateStore:
    """In-memory state tracker for OAuth login flows."""

    def __init__(self, ttl_seconds: int = 600) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, AuthState] = {}

    def generate_state(self, redirect_to: Optional[str] = None) -> AuthState:
        state = secrets.token_urlsafe(24)
        record = AuthState(state=state, created_at=time.time(), redirect_to=redirect_to)
        self._store[state] = record
        self.prune()
        return record

    def consume_state(self, state: str) -> Optional[AuthState]:
        self.prune()
        return self._store.pop(state, None)

    def prune(self) -> None:
        now = time.time()
        expired = [key for key, value in self._store.items() if now - value.created_at > self.ttl_seconds]
        for key in expired:
            self._store.pop(key, None)


state_store = OAuthStateStore()
