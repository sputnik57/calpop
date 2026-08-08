from dataclasses import dataclass, field
from typing import List, Optional


ROLE_ADMIN = "admin"
ROLE_SPONSOR = "sponsor"
ROLE_AUDITOR = "auditor"


@dataclass
class UserContext:
    user_id: str
    email: str
    display_name: str
    roles: List[str] = field(default_factory=list)

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def any_role(self, roles: List[str]) -> bool:
        return any(role in self.roles for role in roles)


@dataclass
class AuthState:
    state: str
    created_at: float
    redirect_to: Optional[str] = None
