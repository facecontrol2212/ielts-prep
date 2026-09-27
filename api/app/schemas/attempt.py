import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import AttemptStatus, Skill
from app.schemas.common import ORMModel
from app.schemas.test import QuestionReview, TestDetail


class AttemptStart(BaseModel):
    test_id: uuid.UUID | None = None
    test_slug: str | None = None


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    value: Any | None = None
    is_flagged: bool = False


class AnswerBatch(BaseModel):
    """Autosave payload. Sent every ~10s and on every change."""

    answers: list[AnswerIn] = Field(default_factory=list)


class AnswerSaveResult(BaseModel):
    """Autosave acknowledgement. `seconds_remaining` re-anchors the client's clock."""

    saved: int
    seconds_remaining: int


class AttemptOut(ORMModel):
    id: uuid.UUID
    test_id: uuid.UUID
    status: AttemptStatus
    started_at: datetime
    expires_at: datetime
    submitted_at: datetime | None
    #: Server-computed and REQUIRED: there is no ORM attribute behind it, so a default
    #: would let `AttemptOut.model_validate(attempt)` ship a silent, permanently-zero
    #: clock. Callers must pass it explicitly (see attempt_service.attempt_out).
    seconds_remaining: int


class AttemptSession(BaseModel):
    """Everything the exam runner needs to render and resume a sitting."""

    attempt: AttemptOut
    test: TestDetail
    answers: list[AnswerIn]


class SectionScore(BaseModel):
    section_order: int
    title: str
    correct: int
    total: int


class TypeScore(BaseModel):
    type: str
    correct: int
    total: int


class AttemptResult(BaseModel):
    attempt_id: uuid.UUID
    skill: Skill
    test_title: str
    status: AttemptStatus
    raw_score: int
    total_questions: int
    band: float
    submitted_at: datetime | None
    duration_seconds: int | None
    sections: list[SectionScore]
    by_type: list[TypeScore]
    review: list[QuestionReview]


class AttemptHistoryItem(ORMModel):
    id: uuid.UUID
    test_id: uuid.UUID
    test_title: str
    skill: Skill
    status: AttemptStatus
    band: float | None
    raw_score: int | None
    submitted_at: datetime | None


class DashboardStats(BaseModel):
    attempts_total: int
    tests_completed: int
    current_streak_days: int
    best_band: dict[str, float]  # skill -> best band
    latest_band: dict[str, float]  # skill -> most recent band
    band_history: list[dict[str, Any]]  # [{date, skill, band}]
    weakest_types: list[TypeScore]
