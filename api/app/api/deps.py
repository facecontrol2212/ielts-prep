"""Shared FastAPI dependencies: database session and the current user."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token, token_predates_password_change
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    if creds is None:
        raise _CREDENTIALS_ERROR
    payload = decode_token(creds.credentials, expected_type="access")
    if payload is None:
        raise _CREDENTIALS_ERROR
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise _CREDENTIALS_ERROR from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_ERROR
    if token_predates_password_change(user, payload):
        raise _CREDENTIALS_ERROR
    return user


def get_current_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def get_optional_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User | None:
    if creds is None:
        return None
    try:
        return get_current_user(db=db, creds=creds)
    except HTTPException:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
