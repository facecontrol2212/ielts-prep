"""Authentication logic.

Everything that decides *whether* something is allowed lives here; the routers only
translate to and from HTTP. Design notes worth knowing before editing:

* Emails are normalised to lowercase on the way in and are always looked up
  normalised, so ``Ann@Example.com`` and ``ann@example.com`` are one account.
* Login never distinguishes "no such user" from "wrong password", in the response
  *or* in the time taken: an unknown email still pays for one bcrypt verification.
* Email tokens (verification, password reset) are random 32-byte URL-safe strings.
  Only their SHA-256 hash reaches the database, so a database leak cannot be replayed.
  They are strictly one-shot: consuming one stamps ``used_at`` in the same transaction
  that acts on it, and a token is only ever valid for the single purpose it was minted
  for (a verify token can never reset a password).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, Conflict
from app.core.security import (
    create_token,
    decode_token,
    generate_email_token,
    hash_email_token,
    hash_password,
    token_predates_password_change,
    verify_password,
)
from app.models.user import EmailToken, User
from app.schemas.auth import RegisterRequest, TokenPair
from app.services.email import RESET_PASSWORD, VERIFY_EMAIL

VERIFY_EMAIL_TTL = timedelta(hours=24)
RESET_PASSWORD_TTL = timedelta(hours=1)

VALID_PURPOSES = frozenset({VERIFY_EMAIL, RESET_PASSWORD})

#: One message for every credential failure. Never says which half was wrong.
INVALID_CREDENTIALS = "Incorrect email or password"
INVALID_TOKEN = "Invalid or expired token"

#: Sent for /auth/forgot-password whether or not the address exists.
FORGOT_PASSWORD_MESSAGE = "If that email is registered, a reset link is on its way."

_DUMMY_HASH: str | None = None


class InvalidCredentials(AppError):
    def __init__(self) -> None:
        super().__init__(INVALID_CREDENTIALS, 401)


class InvalidToken(AppError):
    def __init__(self, detail: str = INVALID_TOKEN) -> None:
        super().__init__(detail, 400)


def _dummy_hash() -> str:
    """A real bcrypt hash used to burn the same CPU for unknown emails."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("not-a-real-password")
    return _DUMMY_HASH


def _as_utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes even for ``DateTime(timezone=True)``."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def normalise_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == normalise_email(email)))


# ---------------------------------------------------------------- registration


def register_user(db: Session, data: RegisterRequest) -> User:
    """Create an unverified account. Raises 409 when the email is already taken."""
    email = normalise_email(str(data.email))
    if get_user_by_email(db, email) is not None:
        raise Conflict("Email already registered")

    try:
        password_hash = hash_password(data.password)
    except ValueError as exc:  # >72 bytes: bcrypt would silently truncate
        raise AppError(str(exc), 400) from exc

    user = User(
        email=email,
        password_hash=password_hash,
        full_name=data.full_name,
        locale=data.locale,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------- credentials


def authenticate(db: Session, email: str, password: str) -> User:
    """Return the user, or raise an identical 401 for every kind of failure."""
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _dummy_hash())  # equalise timing
        raise InvalidCredentials()
    if not verify_password(password, user.password_hash):
        raise InvalidCredentials()
    if not user.is_active:
        # Deliberately the same response: a disabled account is not advertised.
        raise InvalidCredentials()
    return user


def touch_last_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(UTC)
    db.commit()


# ---------------------------------------------------------------- jwt tokens


def issue_token_pair(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, "access"),
        refresh_token=create_token(user.id, "refresh"),
        expires_in=settings.access_token_expire_minutes * 60,
    )


def rotate_refresh_token(db: Session, refresh_token: str) -> TokenPair:
    """Exchange a refresh token for a brand new pair.

    ``decode_token`` enforces ``type == "refresh"``, so an access token presented
    here is rejected with the same 401 as a forged or expired one.
    """
    payload = decode_token(refresh_token, expected_type="refresh")
    if payload is None:
        raise InvalidCredentials()
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise InvalidCredentials() from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise InvalidCredentials()
    if token_predates_password_change(user, payload):
        raise InvalidCredentials()
    return issue_token_pair(user)


# ---------------------------------------------------------------- email tokens


def create_email_token(
    db: Session,
    user: User,
    purpose: str,
    ttl: timedelta | None = None,
) -> str:
    """Mint a one-shot token and store only its hash. Returns the raw token."""
    if purpose not in VALID_PURPOSES:
        raise ValueError(f"Unknown email token purpose: {purpose!r}")
    if ttl is None:
        ttl = VERIFY_EMAIL_TTL if purpose == VERIFY_EMAIL else RESET_PASSWORD_TTL

    raw, token_hash = generate_email_token()
    db.add(
        EmailToken(
            user_id=user.id,
            token_hash=token_hash,
            purpose=purpose,
            expires_at=datetime.now(UTC) + ttl,
        )
    )
    db.commit()
    return raw


def consume_email_token(db: Session, raw: str, purpose: str) -> tuple[EmailToken, User]:
    """Validate and burn a token.

    Rejects, with one indistinguishable 400, tokens that are unknown, expired,
    already used, or minted for a different purpose. The row is stamped ``used_at``
    before the caller acts, and the caller's own commit finalises both together.
    """
    if not raw:
        raise InvalidToken()
    token = db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_email_token(raw)))
    if token is None:
        raise InvalidToken()
    if token.purpose != purpose:
        raise InvalidToken()
    if token.used_at is not None:
        raise InvalidToken()
    if _as_utc(token.expires_at) <= datetime.now(UTC):
        raise InvalidToken()

    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise InvalidToken()

    token.used_at = datetime.now(UTC)
    db.flush()
    return token, user


def invalidate_outstanding_tokens(db: Session, user: User, purpose: str) -> int:
    """Burn every unused token of one purpose for a user. Returns how many."""
    rows = db.scalars(
        select(EmailToken).where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
    ).all()
    now = datetime.now(UTC)
    for row in rows:
        row.used_at = now
    db.flush()
    return len(rows)


# ---------------------------------------------------------------- flows


def verify_email(db: Session, raw: str) -> User:
    _, user = consume_email_token(db, raw, VERIFY_EMAIL)
    user.is_verified = True
    db.commit()
    return user


def reset_password(db: Session, raw: str, new_password: str) -> User:
    """Consume a reset token and install the new password hash.

    Besides burning the presented token, every other outstanding reset token for
    the account is burned too, so a second link sitting in an older email cannot
    be used afterwards.

    ``password_changed_at`` is stamped so that every access and refresh token issued
    before this moment is rejected: a stolen token dies as soon as the real owner
    resets their password.
    """
    _, user = consume_email_token(db, raw, RESET_PASSWORD)
    try:
        user.password_hash = hash_password(new_password)
    except ValueError as exc:
        raise AppError(str(exc), 400) from exc
    user.password_changed_at = datetime.now(UTC)
    invalidate_outstanding_tokens(db, user, RESET_PASSWORD)
    db.commit()
    return user


def start_password_reset(db: Session, email: str) -> tuple[User, str] | None:
    """Mint a reset token, or return None when the address is not registered.

    The caller must answer identically in both cases.
    """
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        return None
    invalidate_outstanding_tokens(db, user, RESET_PASSWORD)
    return user, create_email_token(db, user, RESET_PASSWORD)
