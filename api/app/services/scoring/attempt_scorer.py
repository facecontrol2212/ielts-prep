"""Scoring a whole attempt: mark every answer, persist, build the result payload.

Scoring is **idempotent**. It recomputes every mark from the stored answers
rather than incrementing anything, and it never moves ``submitted_at`` or
``scored_at`` once they are set, so scoring an attempt twice produces the same
row and the same payload.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.errors import NotFound
from app.models.attempt import AttemptAnswer
from app.models.enums import AttemptStatus, Skill
from app.models.test import Question, Section, Test
from app.schemas.attempt import AttemptResult, SectionScore, TypeScore
from app.schemas.test import QuestionReview
from app.services.scoring import AnswerCheck
from app.services.scoring.bands import BandTableMissing, raw_to_band
from app.services.scoring.checker import REASON_BLANK, REASON_WRONG, check_answer

if TYPE_CHECKING:  # pragma: no cover - typing only
    from sqlalchemy.orm import Session

    from app.models.attempt import Attempt

__all__ = ["score_attempt"]

#: Skills whose result is a raw score out of 40 converted with a band table.
_RAW_SCORED_SKILLS = frozenset({Skill.LISTENING, Skill.READING})


def _as_utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; treat those as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _ordered_questions(db: "Session", test: Test) -> list[tuple[Section, Question]]:
    """Every question of the test, in section then question-number order."""
    sections = db.scalars(
        select(Section)
        .where(Section.test_id == test.id)
        .order_by(Section.order)
        .options(selectinload(Section.questions).selectinload(Question.answer_key))
    ).all()
    pairs: list[tuple[Section, Question]] = []
    for section in sections:
        for question in sorted(section.questions, key=lambda q: q.number):
            pairs.append((section, question))
    return pairs


def _accepted_answers(question: Question) -> list[str]:
    key = question.answer_key
    if key is None or not key.accepted:
        return []
    return [str(item) for item in key.accepted]


def score_attempt(db: "Session", attempt: "Attempt") -> AttemptResult:
    """Mark every answer, persist the results and return the full result payload."""
    test = db.get(Test, attempt.test_id)
    if test is None:  # pragma: no cover - defensive; FK makes this unreachable
        raise NotFound("Test")

    pairs = _ordered_questions(db, test)
    answers = {
        row.question_id: row
        for row in db.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
    }

    now = datetime.now(UTC)
    raw_score = 0
    review: list[QuestionReview] = []
    section_tally: dict[int, dict[str, Any]] = {}
    type_tally: dict[str, dict[str, int]] = {}

    for section, question in pairs:
        row = answers.get(question.id)
        value = row.value if row is not None else None
        key = question.answer_key
        if key is None:
            # A question with no key cannot be marked correct; flag it as wrong
            # rather than quietly shrinking the test out from under the student.
            check = AnswerCheck(False, REASON_BLANK if value is None else REASON_WRONG)
        else:
            check = check_answer(question, key, value)

        if row is not None:
            row.is_correct = check.is_correct
            row.reason = check.reason
            row.checked_at = row.checked_at or now

        if check.is_correct:
            raw_score += 1

        bucket = section_tally.setdefault(
            section.order, {"title": section.title, "correct": 0, "total": 0}
        )
        bucket["total"] += 1
        bucket["correct"] += int(check.is_correct)

        type_bucket = type_tally.setdefault(str(question.type), {"correct": 0, "total": 0})
        type_bucket["total"] += 1
        type_bucket["correct"] += int(check.is_correct)

        review.append(
            QuestionReview(
                question_id=question.id,
                number=question.number,
                type=question.type,
                prompt=question.prompt,
                your_answer=value,
                correct_answers=_accepted_answers(question),
                is_correct=check.is_correct,
                reason=check.reason,
                explanation=key.explanation if key is not None else None,
                evidence=question.evidence,
                audio_timestamp=question.audio_timestamp,
            )
        )

    total_questions = test.question_count or len(pairs)

    band = 0.0
    if Skill(test.skill) in _RAW_SCORED_SKILLS:
        try:
            band = raw_to_band(db, test.skill, test.variant, raw_score)
        except BandTableMissing:  # pragma: no cover - both raw skills are seeded
            band = 0.0

    sections = [
        SectionScore(
            section_order=order,
            title=data["title"],
            correct=data["correct"],
            total=data["total"],
        )
        for order, data in sorted(section_tally.items())
    ]
    by_type = [
        TypeScore(type=name, correct=data["correct"], total=data["total"])
        for name, data in type_tally.items()
    ]

    attempt.raw_score = raw_score
    attempt.band = band
    attempt.breakdown = {
        "sections": [s.model_dump() for s in sections],
        "by_type": [t.model_dump() for t in by_type],
    }
    attempt.submitted_at = attempt.submitted_at or now
    attempt.scored_at = attempt.scored_at or now
    attempt.status = AttemptStatus.SCORED
    db.commit()

    duration = int((_as_utc(attempt.submitted_at) - _as_utc(attempt.started_at)).total_seconds())

    return AttemptResult(
        attempt_id=attempt.id,
        skill=test.skill,
        test_title=test.title,
        status=attempt.status,
        raw_score=raw_score,
        total_questions=total_questions,
        band=band,
        submitted_at=attempt.submitted_at,
        duration_seconds=duration,
        sections=sections,
        by_type=by_type,
        review=review,
    )
