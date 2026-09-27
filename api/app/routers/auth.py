"""auth routes. See docs/api-contract.md for the endpoints this module owns.

The router is deliberately thin: every decision lives in ``app.services.auth_service``.
"""

from fastapi import APIRouter, status

from app.api.deps import DbSession
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
    VerifyEmailRequest,
)
from app.schemas.common import Message
from app.services import auth_service
from app.services.email import (
    VERIFY_EMAIL,
    EmailSenderDep,
    send_password_reset_email,
    send_verification_email,
)

router = APIRouter()


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: DbSession, sender: EmailSenderDep) -> TokenPair:
    """Create an account, send the verification email, and sign the user straight in.

    The account starts with ``is_verified=False``; verification gates features, not login.
    """
    user = auth_service.register_user(db, data)
    raw = auth_service.create_email_token(db, user, VERIFY_EMAIL)
    send_verification_email(sender, user.email, raw)
    return auth_service.issue_token_pair(user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginRequest, db: DbSession) -> TokenPair:
    user = auth_service.authenticate(db, str(data.email), data.password)
    auth_service.touch_last_login(db, user)
    return auth_service.issue_token_pair(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshRequest, db: DbSession) -> TokenPair:
    return auth_service.rotate_refresh_token(db, data.refresh_token)


@router.post("/verify-email", response_model=Message)
def verify_email(data: VerifyEmailRequest, db: DbSession) -> Message:
    auth_service.verify_email(db, data.token)
    return Message(detail="Email verified")


@router.post("/forgot-password", response_model=Message)
def forgot_password(data: ForgotPasswordRequest, db: DbSession, sender: EmailSenderDep) -> Message:
    """Always 200 with the same body: the response must not reveal who has an account."""
    result = auth_service.start_password_reset(db, str(data.email))
    if result is not None:
        user, raw = result
        send_password_reset_email(sender, user.email, raw)
    return Message(detail=auth_service.FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPasswordRequest, db: DbSession) -> Message:
    auth_service.reset_password(db, data.token, data.password)
    return Message(detail="Password updated")
