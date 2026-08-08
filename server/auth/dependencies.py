from typing import List

from fastapi import Depends, HTTPException, Request, status

from .models import ROLE_ADMIN, ROLE_AUDITOR, ROLE_SPONSOR, UserContext

ROLE_HIERARCHY = {
    ROLE_ADMIN: [ROLE_ADMIN, ROLE_AUDITOR, ROLE_SPONSOR],
    ROLE_AUDITOR: [ROLE_AUDITOR],
    ROLE_SPONSOR: [ROLE_SPONSOR],
}


def get_current_user(request: Request) -> UserContext:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def require_roles(required: List[str]):
    def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.any_role(required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency


require_admin = require_roles([ROLE_ADMIN])
require_admin_or_auditor = require_roles([ROLE_ADMIN, ROLE_AUDITOR])
require_admin_or_sponsor = require_roles([ROLE_ADMIN, ROLE_SPONSOR])
