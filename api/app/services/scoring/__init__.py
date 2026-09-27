"""Scoring engine public interface.

Everything outside this package imports from here and nowhere deeper.
Implementation lives in the sibling modules:

- ``normalise``      - the pure text-normalisation pipeline (plan.md §6)
- ``checker``        - marking one answer against its key
- ``band_data``      - the raw-score -> band tables as seed data (plan.md §7)
- ``bands``          - band conversion, reading the tables from the database
- ``attempt_scorer`` - marking a whole attempt and building the result payload

The implementations are imported inside the functions: ``AnswerCheck`` is
defined here and the sibling modules import it from here, so a module-level
import would be circular.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.attempt import Attempt
    from app.models.enums import Skill, Variant
    from app.models.test import AnswerKey, Question
    from app.schemas.attempt import AttemptResult


@dataclass(frozen=True)
class AnswerCheck:
    """Result of marking one answer."""

    is_correct: bool
    #: None when correct; otherwise "wrong" | "blank" | "spelling" | "over_word_limit"
    reason: str | None = None
    #: which accepted form matched, for the review screen
    matched: str | None = None


def check_answer(question: "Question", key: "AnswerKey", value: Any) -> AnswerCheck:
    """Mark a single answer against its key."""
    from app.services.scoring.checker import check_answer as impl

    return impl(question, key, value)


def score_attempt(db: "Session", attempt: "Attempt") -> "AttemptResult":
    """Mark every answer, persist the results and return the full result payload."""
    from app.services.scoring.attempt_scorer import score_attempt as impl

    return impl(db, attempt)


def raw_to_band(db: "Session", skill: "Skill", variant: "Variant", raw: int) -> float:
    """Convert a raw score out of 40 to an IELTS band using the DB conversion table."""
    from app.services.scoring.bands import raw_to_band as impl

    return impl(db, skill, variant, raw)


def overall_band(listening: float, reading: float, writing: float, speaking: float) -> float:
    """Average the four skill bands and apply official IELTS rounding."""
    from app.services.scoring.bands import overall_band as impl

    return impl(listening, reading, writing, speaking)


def seed_band_tables(db: "Session") -> int:
    """Populate the ``band_tables`` table from the seed data. Idempotent."""
    from app.services.scoring.bands import seed_band_tables as impl

    return impl(db)


__all__ = [
    "AnswerCheck",
    "check_answer",
    "overall_band",
    "raw_to_band",
    "score_attempt",
    "seed_band_tables",
]
