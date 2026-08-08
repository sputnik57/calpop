from typing import Generator

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from auth.models import UserContext
from db.models import User
from db.session import get_session


def get_db() -> Generator[Session, None, None]:
    yield from get_session()


def get_db_user(
    db: Session = Depends(get_db),
    user_context: UserContext = Depends(get_current_user),
) -> User:
    user = db.query(User).filter(User.email == user_context.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User record not provisioned")
    return user
