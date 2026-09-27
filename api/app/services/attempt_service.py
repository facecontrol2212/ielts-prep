"""Attempt lifecycle: start, resume, autosave, submit, expiry and abandon.

The server owns the clock (plan.md §4). Nothing here trusts a client timestamp:
``expires_at`` is computed once at start time and every later decision is made by
comparing it against ``datetime.now(UTC)``.

Scoring is deliberately reached through the ``scoring`` *module* rather than by
importing ``score_attempt`` directly, so the engine stays swappable (and patchable
in tests) at ``app.services.scoring.score_attempt``.
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.models.attempt import Attempt, AttemptAnswer
from app.models.enums import AttemptStatus
from app.models.test import Question, QuestionGroup, Section, Test
from app.models.user import User
from app.schemas.attempt import (
    AnswerBatch,
    AnswerIn,
    AttemptOut,
    AttemptResult,
    AttemptSession,
    AttemptStart,
)
from app.schemas.test import QuestionGroupOut, QuestionOut, TestDetail
from app.services import scoring

#: Clock-skew tolerance: an autosave that left the browser just before the deadline
#: is still accepted this many seconds after ``expires_at``.
SAVE_GRACE_SECONDS = 30

#: Namespace for the ids of groups synthesised for ungrouped questions. Stable across
#: requests (uuid5), so a resumed sitting keeps the same group ids it started with.
_SYNTHETIC_GROUP_NS = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

#: Statuses from which no further mutation is allowed.
FINAL_STATUSES = frozenset(
    {AttemptStatus.SUBMITTED, AttemptStatus.SCORED, AttemptStatus.ABANDONED, AttemptStatus.EXPIRED}
)


# ------------------------------------------------------------------ time helpers


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    """Treat a naive timestamp as UTC.

    SQLite (used by the test suite) drops tzinfo on round-trip even for
    ``DateTime(timezone=True)`` columns; Postgres does not. Normalising here keeps
    every comparison in this module safe on both.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def seconds_remaining(attempt: Attempt) -> int:
    """Authoritative countdown, computed server-side and never negative."""
    delta = _aware(attempt.expires_at) - _now()
    return max(0, int(delta.total_seconds()))


# ------------------------------------------------------------------ loading


def load_test_detail(db: Session, test_id: uuid.UUID) -> Test:
    """Load a test with sections -> groups -> questions eagerly (3 queries, no N+1)."""
    stmt = (
        select(Test)
        .where(Test.id == test_id)
        .options(
            selectinload(Test.sections)
            .selectinload(Section.groups)
            .selectinload(QuestionGroup.questions)
        )
    )
    test = db.execute(stmt).scalar_one_or_none()
    if test is None:
        raise NotFound("Test")
    return test


def resolve_test(db: Session, payload: AttemptStart) -> Test | None:
    """Look up the test named by an AttemptStart body (by id or by slug)."""
    if payload.test_id is None and payload.test_slug is None:
        raise AppError("Provide either test_id or test_slug")
    stmt = select(Test)
    if payload.test_id is not None:
        stmt = stmt.where(Test.id == payload.test_id)
    else:
        stmt = stmt.where(Test.slug == payload.test_slug)
    return db.execute(stmt).scalar_one_or_none()


def get_attempt(db: Session, user: User, attempt_id: uuid.UUID) -> Attempt:
    """Fetch an attempt and check ownership.

    A missing attempt is a 404; somebody else's attempt is a 403. We do not
    disguise the second as the first: attempt ids are unguessable UUIDv4s, so
    there is nothing to enumerate, and a straight answer is easier to debug.
    """
    # with_for_update takes a row lock on Postgres so two concurrent requests cannot
    # both auto-submit or both submit the same attempt; SQLite ignores it.
    attempt = db.get(Attempt, attempt_id, with_for_update=True)
    if attempt is None:
        raise NotFound("Attempt")
    if attempt.user_id != user.id:
        raise Forbidden("This attempt belongs to another user")
    return attempt


# ------------------------------------------------------------------ lifecycle


def start_attempt(db: Session, user: User, test: Test | None) -> Attempt:
    """Open a sitting. 404 for a missing/unpublished test, 409 for a live attempt."""
    if test is None or not test.is_published:
        raise NotFound("Test")

    existing = (
        db.execute(
            select(Attempt)
            .where(
                Attempt.user_id == user.id,
                Attempt.test_id == test.id,
                Attempt.status == AttemptStatus.IN_PROGRESS,
            )
            .order_by(Attempt.started_at.desc())
        )
        .scalars()
        .first()
    )

    if existing is not None:
        # An abandoned-in-the-browser attempt that has run out of time must not
        # block a fresh sitting for ever, so settle it first and re-check.
        enforce_expiry(db, existing)
        if existing.status == AttemptStatus.IN_PROGRESS:
            raise Conflict(f"An attempt on this test is already in progress: {existing.id}")

    started = _now()
    attempt = Attempt(
        user_id=user.id,
        test_id=test.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=started,
        expires_at=started
        + timedelta(seconds=test.duration_seconds + (test.transfer_seconds or 0)),
    )
    db.add(attempt)
    db.commit()
    return attempt


def enforce_expiry(db: Session, attempt: Attempt, *, grace_seconds: int = 0) -> Attempt:
    """Settle an attempt whose deadline has passed.

    Called FIRST on every read and write path. An ``in_progress`` attempt found
    past ``expires_at`` (plus any caller-supplied grace) is auto-submitted and
    scored, so the client can never keep a dead sitting alive by not asking.
    """
    if attempt.status != AttemptStatus.IN_PROGRESS:
        return attempt
    deadline = _aware(attempt.expires_at) + timedelta(seconds=grace_seconds)
    if _now() <= deadline:
        return attempt
    _finalise(db, attempt, auto_submitted=True)
    return attempt


def _finalise(db: Session, attempt: Attempt, *, auto_submitted: bool) -> AttemptResult:
    """Close an in-progress attempt and hand it to the scoring engine."""
    now = _now()
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = now
    attempt.auto_submitted = auto_submitted
    db.flush()

    result = scoring.score_attempt(db, attempt)

    # The engine owns the marks; we own the lifecycle. Fill in only what it left blank
    # so the contract ("submit sets status=scored") holds whatever the engine does.
    if attempt.status != AttemptStatus.SCORED:
        attempt.status = AttemptStatus.SCORED
    if attempt.scored_at is None:
        attempt.scored_at = now
    if attempt.raw_score is None:
        attempt.raw_score = result.raw_score
    if attempt.band is None:
        attempt.band = result.band
    db.commit()

    if result.status != attempt.status:
        result.status = AttemptStatus(attempt.status)
    return result


def submit(db: Session, attempt: Attempt) -> AttemptResult:
    """Manual submission. Double submission is a 409, never a re-score."""
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise Conflict(f"Attempt is already {attempt.status}")
    return _finalise(db, attempt, auto_submitted=False)


def get_result(db: Session, attempt: Attempt) -> AttemptResult:
    """The result payload for a finished attempt. 409 while it is still running."""
    if attempt.status != AttemptStatus.SCORED:
        raise Conflict(f"Attempt is {attempt.status}, not scored")
    # score_attempt is the only builder of AttemptResult and is deterministic over
    # stored answers, so replaying it is a safe way to rebuild the payload.
    return scoring.score_attempt(db, attempt)


def abandon(db: Session, attempt: Attempt) -> Attempt:
    """Give up on a sitting. Idempotent; refuses to undo a finished attempt."""
    if attempt.status == AttemptStatus.ABANDONED:
        return attempt
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise Conflict(f"Attempt is already {attempt.status}")
    attempt.status = AttemptStatus.ABANDONED
    db.commit()
    return attempt


# ------------------------------------------------------------------ answers


def list_answers(db: Session, attempt: Attempt) -> list[AnswerIn]:
    """Saved answers, ordered by question number so the runner can replay them."""
    rows = (
        db.execute(
            select(AttemptAnswer)
            .join(Question, Question.id == AttemptAnswer.question_id)
            .where(AttemptAnswer.attempt_id == attempt.id)
            .order_by(Question.number)
        )
        .scalars()
        .all()
    )
    return [
        AnswerIn(question_id=row.question_id, value=row.value, is_flagged=row.is_flagged)
        for row in rows
    ]


def _question_ids_for_test(db: Session, test_id: uuid.UUID) -> set[uuid.UUID]:
    return set(
        db.execute(
            select(Question.id)
            .join(Section, Section.id == Question.section_id)
            .where(Section.test_id == test_id)
        ).scalars()
    )


def save_answers(db: Session, attempt: Attempt, batch: AnswerBatch) -> int:
    """Idempotent upsert keyed on (attempt_id, question_id). Returns rows touched.

    Writes are refused once the attempt has left ``in_progress``; the deadline
    itself is enforced with a small grace window (see ``SAVE_GRACE_SECONDS``) so a
    save that was already in flight when the timer ran out is not lost to clock skew.
    """
    enforce_expiry(db, attempt, grace_seconds=SAVE_GRACE_SECONDS)
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise Conflict(f"Attempt is {attempt.status}; answers are locked")

    if not batch.answers:
        return 0

    incoming: dict[uuid.UUID, AnswerIn] = {}
    for answer in batch.answers:
        # last write wins inside a single batch
        incoming[answer.question_id] = answer

    allowed = _question_ids_for_test(db, attempt.test_id)
    unknown = sorted(str(qid) for qid in incoming if qid not in allowed)
    if unknown:
        raise AppError(
            "These questions do not belong to this attempt's test: " + ", ".join(unknown)
        )

    existing = {
        row.question_id: row
        for row in db.execute(
            select(AttemptAnswer).where(
                AttemptAnswer.attempt_id == attempt.id,
                AttemptAnswer.question_id.in_(incoming.keys()),
            )
        ).scalars()
    }

    for question_id, answer in incoming.items():
        row = existing.get(question_id)
        if row is None:
            db.add(
                AttemptAnswer(
                    attempt_id=attempt.id,
                    question_id=question_id,
                    value=answer.value,
                    is_flagged=answer.is_flagged,
                )
            )
        else:
            row.value = answer.value
            row.is_flagged = answer.is_flagged
    db.commit()
    return len(incoming)


# ------------------------------------------------------------------ session payload


def attempt_out(attempt: Attempt) -> AttemptOut:
    """The only place an ``Attempt`` becomes an ``AttemptOut``.

    Built field by field rather than by ``model_validate``: ``seconds_remaining`` has
    no ORM attribute behind it and is deliberately required, so constructing it
    explicitly is what stops a silent, permanently-zero clock reaching the runner.
    """
    return AttemptOut(
        id=attempt.id,
        test_id=attempt.test_id,
        status=AttemptStatus(attempt.status),
        started_at=_aware(attempt.started_at),
        expires_at=_aware(attempt.expires_at),
        submitted_at=attempt.submitted_at,
        seconds_remaining=seconds_remaining(attempt),
    )


def build_session(db: Session, attempt: Attempt) -> AttemptSession:
    """Everything the exam runner needs to render or resume a sitting.

    The payload is built from ``TestDetail``/``QuestionOut``, neither of which has an
    answer field, and the answer_key relationship is never traversed here. See
    ``tests/test_attempts_api.py::test_session_payload_never_contains_the_answer_key``.
    """
    test = load_test_detail(db, attempt.test_id)
    detail = TestDetail.model_validate(test)
    _attach_ungrouped_questions(db, detail)
    return AttemptSession(
        attempt=attempt_out(attempt),
        test=detail,
        answers=list_answers(db, attempt),
    )


def _attach_ungrouped_questions(db: Session, detail: TestDetail) -> None:
    """Fold questions with no ``group_id`` into synthetic groups.

    The exam runner renders sections -> groups -> questions, so a question left out
    of a group would simply never appear on screen and would then be marked wrong at
    submission. Grouping every question is the content importer's job, but a silent
    hole that loses a student marks is not an acceptable failure mode for bad content,
    so the payload heals it here. Consecutive questions of the same type share a
    synthetic group, which is how a real paper reads.
    """
    section_ids = [s.id for s in detail.sections]
    if not section_ids:
        return

    orphans = (
        db.execute(
            select(Question)
            .where(Question.section_id.in_(section_ids), Question.group_id.is_(None))
            .order_by(Question.section_id, Question.number)
        )
        .scalars()
        .all()
    )
    if not orphans:
        return

    by_section: dict[uuid.UUID, list[Question]] = defaultdict(list)
    for question in orphans:
        by_section[question.section_id].append(question)

    for section in detail.sections:
        questions = by_section.get(section.id)
        if not questions:
            continue
        order = max((g.order for g in section.groups), default=0)
        current: QuestionGroupOut | None = None
        for question in questions:
            if current is not None and current.type == question.type:
                current.questions.append(QuestionOut.model_validate(question))
                continue
            order += 1
            current = QuestionGroupOut(
                id=uuid.uuid5(_SYNTHETIC_GROUP_NS, f"{section.id}:{question.number}"),
                order=order,
                type=question.type,
                instructions=section.instructions or "",
                word_limit=question.word_limit,
                allow_number=question.allow_number,
                options=None,
                select_count=None,
                content_html=None,
                image_url=None,
                questions=[QuestionOut.model_validate(question)],
            )
            section.groups.append(current)
