"""writing routes. See docs/api-contract.md for the endpoints this module owns.

    PUT  /writing/attempts/{attempt_id}/draft   upsert one task's text
    POST /writing/attempts/{attempt_id}/grade   AI-grade every task of the attempt
    GET  /writing/attempts/{attempt_id}         read the submissions back

Every endpoint is owner-only (403 otherwise). Grading is capped per user per UTC day by
``settings.writing_submissions_per_day`` (429 when exceeded).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.models.attempt import Attempt, WritingSubmission
from app.models.enums import AttemptStatus
from app.models.test import Section
from app.models.user import User
from app.schemas.writing import WritingDraft, WritingSubmissionOut
from app.services.ai.writing_grader import count_words, grade_submission

router = APIRouter()

#: A draft may still be edited while the attempt is live or handed in, but not once it has been
#: scored or thrown away.
_DRAFTABLE = {AttemptStatus.IN_PROGRESS, AttemptStatus.SUBMITTED}


class TooManyRequests(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail, status.HTTP_429_TOO_MANY_REQUESTS)


def _owned_attempt(db: DbSession, attempt_id: uuid.UUID, user: User) -> Attempt:
    attempt = db.get(Attempt, attempt_id)
    if attempt is None:
        raise NotFound("Attempt")
    if attempt.user_id != user.id:
        raise Forbidden("This attempt belongs to another user")
    return attempt


def _submissions(db: DbSession, attempt_id: uuid.UUID) -> list[WritingSubmission]:
    stmt = (
        select(WritingSubmission)
        .where(WritingSubmission.attempt_id == attempt_id)
        .order_by(WritingSubmission.task_number)
    )
    return list(db.scalars(stmt))


def _graded_today(db: DbSession, user_id: uuid.UUID) -> int:
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count(WritingSubmission.id))
        .join(Attempt, Attempt.id == WritingSubmission.attempt_id)
        .where(
            Attempt.user_id == user_id,
            WritingSubmission.graded_at.is_not(None),
            WritingSubmission.graded_at >= day_start,
        )
    )
    return int(db.scalar(stmt) or 0)


@router.put("/attempts/{attempt_id}/draft", response_model=WritingSubmissionOut)
def save_draft(
    attempt_id: uuid.UUID,
    payload: WritingDraft,
    db: DbSession,
    user: CurrentUser,
) -> WritingSubmission:
    """Idempotent upsert of one task's text. The word count is always recomputed server-side."""
    attempt = _owned_attempt(db, attempt_id, user)
    if attempt.status not in _DRAFTABLE:
        raise Conflict(f"Attempt is {attempt.status}; drafts can no longer be saved")

    section = db.get(Section, payload.section_id)
    if section is None or section.test_id != attempt.test_id:
        raise NotFound("Section")

    submission = db.scalar(
        select(WritingSubmission).where(
            WritingSubmission.attempt_id == attempt.id,
            WritingSubmission.task_number == payload.task_number,
        )
    )
    if submission is None:
        submission = WritingSubmission(
            attempt_id=attempt.id,
            section_id=section.id,
            task_number=payload.task_number,
        )
        db.add(submission)

    submission.section_id = section.id
    submission.text = payload.text or ""
    submission.word_count = count_words(submission.text)
    db.commit()
    db.refresh(submission)
    return submission


@router.post("/attempts/{attempt_id}/grade", response_model=list[WritingSubmissionOut])
def grade_attempt(
    attempt_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> list[WritingSubmission]:
    """Grade every task of the attempt with Claude, within the caller's daily allowance."""
    attempt = _owned_attempt(db, attempt_id, user)
    submissions = _submissions(db, attempt.id)
    if not submissions:
        raise Conflict("Nothing to grade — save a draft first")

    limit = settings.writing_submissions_per_day
    used = _graded_today(db, user.id)
    if used + len(submissions) > limit:
        raise TooManyRequests(
            f"Daily AI writing limit reached ({used}/{limit} graded today). Try again tomorrow."
        )

    for submission in submissions:
        grade_submission(db, submission)
    db.commit()
    for submission in submissions:
        db.refresh(submission)
    return submissions


@router.get("/attempts/{attempt_id}", response_model=list[WritingSubmissionOut])
def list_submissions(
    attempt_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> list[WritingSubmission]:
    attempt = _owned_attempt(db, attempt_id, user)
    return _submissions(db, attempt.id)
