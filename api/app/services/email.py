"""Outbound email.

v1 has no SMTP integration: the platform only ever needs to deliver a verification
link and a password-reset link, and in development/staging printing them to the log
is more useful than a real mailbox. What matters is that the *seam* exists, so that
adding an SMTP/SES sender later touches this file only, and so that a test can assert
"a verification email was sent to X carrying token Y" without monkeypatching anything.

Injection: routers depend on :data:`EmailSenderDep`. A test overrides
``app.dependency_overrides[get_email_sender]`` with a :class:`MemoryEmailSender`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Annotated, Protocol, runtime_checkable

from fastapi import Depends

from app.core.config import settings

logger = logging.getLogger("app.email")

VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"


@dataclass(frozen=True, slots=True)
class EmailMessage:
    """One outbound message.

    ``token`` is kept as a separate field (as well as being embedded in ``body``)
    purely so tests and future providers can address it without parsing the body.
    """

    to: str
    subject: str
    body: str
    kind: str = "generic"
    token: str | None = None


@runtime_checkable
class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class ConsoleEmailSender:
    """Writes the message to the application log. The default everywhere in v1."""

    def send(self, message: EmailMessage) -> None:
        logger.info(
            "EMAIL [%s] to=%s subject=%s\n%s",
            message.kind,
            message.to,
            message.subject,
            message.body,
        )


class NullEmailSender:
    """Drops the message. Used when email is deliberately disabled."""

    def send(self, message: EmailMessage) -> None:  # pragma: no cover - trivial
        return None


@dataclass
class MemoryEmailSender:
    """Records messages in memory. For tests."""

    sent: list[EmailMessage] = field(default_factory=list)

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)

    # -- assertions helpers -------------------------------------------------
    def last_to(self, address: str) -> EmailMessage | None:
        for message in reversed(self.sent):
            if message.to.lower() == address.lower():
                return message
        return None

    def tokens_for(self, address: str, kind: str | None = None) -> list[str]:
        return [
            m.token
            for m in self.sent
            if m.to.lower() == address.lower() and m.token and (kind is None or m.kind == kind)
        ]


def build_sender(environment: str | None = None) -> EmailSender:
    """Pick a sender for an environment name. The only place the choice is made."""
    env = (environment if environment is not None else settings.environment).strip().lower()
    if env in {"test", "testing"}:
        return MemoryEmailSender()
    if env in {"production", "prod", "staging"}:
        # No SMTP provider is configured in v1; log loudly rather than fail a request.
        logger.warning("No SMTP provider configured for environment %r; logging emails", env)
        return ConsoleEmailSender()
    return ConsoleEmailSender()


@lru_cache
def get_email_sender() -> EmailSender:
    """FastAPI dependency. Cached so a MemoryEmailSender keeps its history."""
    return build_sender()


EmailSenderDep = Annotated[EmailSender, Depends(get_email_sender)]


# ---------------------------------------------------------------- templates


def _link(path: str, token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/{path.lstrip('/')}?token={token}"


def send_verification_email(sender: EmailSender, to: str, token: str) -> EmailMessage:
    message = EmailMessage(
        to=to,
        subject=f"Confirm your {settings.app_name} email",
        body=(
            "Welcome! Confirm your email address to activate your account:\n\n"
            f"{_link('/verify-email', token)}\n\n"
            "This link can be used once and expires in 24 hours."
        ),
        kind=VERIFY_EMAIL,
        token=token,
    )
    sender.send(message)
    return message


def send_password_reset_email(sender: EmailSender, to: str, token: str) -> EmailMessage:
    message = EmailMessage(
        to=to,
        subject=f"Reset your {settings.app_name} password",
        body=(
            "Someone asked to reset the password for this address.\n"
            "If it was you, choose a new password here:\n\n"
            f"{_link('/reset-password', token)}\n\n"
            "This link can be used once and expires in 1 hour. "
            "If it was not you, ignore this email: nothing has changed."
        ),
        kind=RESET_PASSWORD,
        token=token,
    )
    sender.send(message)
    return message
