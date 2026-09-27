"""Password hashing and JWT issuing/verification. Shared by every router."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; reject rather than surprise the user
    if len(password.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        return False


def create_token(
    subject: str | uuid.UUID,
    token_type: TokenType = "access",
    expires_delta: timedelta | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    if expires_delta is None:
        expires_delta = (
            timedelta(minutes=settings.access_token_expire_minutes)
            if token_type == "access"
            else timedelta(days=settings.refresh_token_expire_days)
        )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": int(now.timestamp()),
        # Standard `iat` has one-second resolution, which cannot tell a token minted
        # just before a password reset from one minted just after it. `iat_f` keeps the
        # microseconds so revocation is exact.
        "iat_f": now.timestamp(),
        "exp": int((now + expires_delta).timestamp()),
        "jti": secrets.token_urlsafe(8),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any] | None:
    """Return the payload, or None when the token is invalid, expired or the wrong type."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
    if expected_type and payload.get("type") != expected_type:
        return None
    return payload


def token_issued_at(payload: dict[str, Any]) -> float | None:
    """Sub-second issue time, falling back to the standard second-resolution claim."""
    for claim in ("iat_f", "iat"):
        value = payload.get(claim)
        if isinstance(value, int | float):
            return float(value)
    return None


def token_predates_password_change(user: Any, payload: dict[str, Any]) -> bool:
    """True when a token was minted before the account's last password change.

    Access and refresh tokens are stateless, so a password reset cannot delete the
    ones already handed out. Instead every user carries `password_changed_at` and
    every token carries its issue time; anything older is refused. That is what makes
    "reset your password" an effective answer to a stolen session.
    """
    changed_at = getattr(user, "password_changed_at", None)
    if changed_at is None:
        return False
    issued_at = token_issued_at(payload)
    if issued_at is None:
        return True
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=UTC)
    return issued_at < changed_at.timestamp()


def generate_email_token() -> tuple[str, str]:
    """Return (raw_token_for_the_email, sha256_hash_for_the_database)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_email_token(raw)


def hash_email_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
