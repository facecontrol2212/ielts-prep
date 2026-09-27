import uuid
from datetime import date

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import Locale
from app.schemas.common import ORMModel


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)
    locale: Locale = Locale.UZ


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    locale: Locale
    target_band: float | None
    exam_date: date | None
    is_verified: bool
    is_admin: bool


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    locale: Locale | None = None
    target_band: float | None = Field(default=None, ge=0, le=9)
    exam_date: date | None = None
