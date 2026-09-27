import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import Locale

if TYPE_CHECKING:
    from app.models.attempt import Attempt


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(120), default=None)
    locale: Mapped[Locale] = mapped_column(String(2), default=Locale.UZ)

    target_band: Mapped[float | None] = mapped_column(Float, default=None)
    exam_date: Mapped[date | None] = mapped_column(Date, default=None)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    #: Tokens issued before this instant are rejected. Set on every password change so a
    #: stolen refresh token dies the moment the real owner resets their password.
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    telegram_id: Mapped[str | None] = mapped_column(String(64), unique=True, default=None)

    attempts: Mapped[list["Attempt"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<User {self.email}>"


class EmailToken(UUIDMixin, TimestampMixin, Base):
    """One-shot token for email verification and password reset."""

    __tablename__ = "email_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(32))  # verify_email | reset_password
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
