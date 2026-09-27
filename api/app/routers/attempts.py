"""Attempt endpoints. See docs/api-contract.md.

Thin wrappers: every rule (ownership, expiry, double submission, the answer-key
blackout) lives in ``app.services.attempt_service``. Each handler resolves the
attempt with an ownership check, settles any expiry, and then delegates.
"""

import uuid

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.schemas.attempt import AnswerBatch, AttemptResult, AttemptSession, AttemptStart
from app.schemas.common import Message
from app.services import attempt_service as svc

router = APIRouter()


class AnswerSaveResult(BaseModel):
    """Autosave acknowledgement. Belongs in app/schemas/attempt.py (Agent C cannot
    edit that file); see the report."""

    saved: int
    seconds_remaining: int


@router.post("", response_model=AttemptSession, status_code=status.HTTP_201_CREATED)
def start_attempt(payload: AttemptStart, db: DbSession, user: CurrentUser) -> AttemptSession:
    """Open a sitting and return the full exam payload (no answer key)."""
    test = svc.resolve_test(db, payload)
    attempt = svc.start_attempt(db, user, test)
    return svc.build_session(db, attempt)


@router.get("/{attempt_id}", response_model=AttemptSession)
def get_attempt(attempt_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AttemptSession:
    """Resume: the same payload as start, with the saved answers replayed."""
    attempt = svc.get_attempt(db, user, attempt_id)
    svc.enforce_expiry(db, attempt)
    return svc.build_session(db, attempt)


@router.patch("/{attempt_id}/answers", response_model=AnswerSaveResult)
def save_answers(
    attempt_id: uuid.UUID, batch: AnswerBatch, db: DbSession, user: CurrentUser
) -> AnswerSaveResult:
    """Autosave. Idempotent per question; 409 once the attempt is finished."""
    attempt = svc.get_attempt(db, user, attempt_id)
    saved = svc.save_answers(db, attempt, batch)
    return AnswerSaveResult(saved=saved, seconds_remaining=svc.seconds_remaining(attempt))


@router.post("/{attempt_id}/submit", response_model=AttemptResult)
def submit_attempt(attempt_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AttemptResult:
    """Finish and score synchronously. A second call is a 409."""
    attempt = svc.get_attempt(db, user, attempt_id)
    svc.enforce_expiry(db, attempt)
    return svc.submit(db, attempt)


@router.get("/{attempt_id}/result", response_model=AttemptResult)
def get_result(attempt_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AttemptResult:
    """The scored result. 409 while the attempt is still in progress."""
    attempt = svc.get_attempt(db, user, attempt_id)
    svc.enforce_expiry(db, attempt)
    return svc.get_result(db, attempt)


@router.delete("/{attempt_id}", response_model=Message)
def abandon_attempt(attempt_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Message:
    """Mark the attempt abandoned. The row is kept for history."""
    attempt = svc.get_attempt(db, user, attempt_id)
    svc.enforce_expiry(db, attempt)
    svc.abandon(db, attempt)
    return Message(detail="Attempt abandoned")
