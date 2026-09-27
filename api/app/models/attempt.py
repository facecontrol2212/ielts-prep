import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import AttemptStatus

if TYPE_CHECKING:
    from app.models.user import User


class Attempt(UUIDMixin, TimestampMixin, Base):
    """One student sitting one test. The server owns the clock."""

    __tablename__ = "attempts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"))
    status: Mapped[AttemptStatus] = mapped_column(String(20), default=AttemptStatus.IN_PROGRESS)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    #: started_at + duration (+ transfer). Authoritative deadline, never trusted from the client.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    raw_score: Mapped[int | None] = mapped_column(Integer, default=None)
    band: Mapped[float | None] = mapped_column(Float, default=None)
    #: per-section and per-question-type breakdown for the results screen
    breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    auto_submitted: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="attempts")
    answers: Mapped[list["AttemptAnswer"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )
    writing_submissions: Mapped[list["WritingSubmission"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )


class AttemptAnswer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "attempt_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    #: raw student input: "colour", "A", or ["B", "D"] for multi-select
    value: Mapped[Any | None] = mapped_column(JSON, default=None)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)

    # filled by the scoring engine at submit time
    is_correct: Mapped[bool | None] = mapped_column(Boolean, default=None)
    #: why it was marked wrong: "spelling", "over_word_limit", "wrong", "blank"
    reason: Mapped[str | None] = mapped_column(String(32), default=None)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    attempt: Mapped["Attempt"] = relationship(back_populates="answers")


class WritingSubmission(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "writing_submissions"
    __table_args__ = (UniqueConstraint("attempt_id", "task_number", name="uq_attempt_task"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), index=True
    )
    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"))
    task_number: Mapped[int] = mapped_column(Integer)  # 1 or 2
    text: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)

    # AI evaluation
    band_task: Mapped[float | None] = mapped_column(Float, default=None)
    band_coherence: Mapped[float | None] = mapped_column(Float, default=None)
    band_lexical: Mapped[float | None] = mapped_column(Float, default=None)
    band_grammar: Mapped[float | None] = mapped_column(Float, default=None)
    band_overall: Mapped[float | None] = mapped_column(Float, default=None)
    #: {"strengths": [...], "improvements": [...], "corrections": [...], "rewrite": "..."}
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    model: Mapped[str | None] = mapped_column(String(64), default=None)
    #: Full-price input tokens only. Cache reads bill at 0.1x and cache writes at 1.25x,
    #: so they are counted separately or the unit economics cannot be reconstructed.
    input_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    output_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    cache_read_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    cache_write_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    grading_error: Mapped[str | None] = mapped_column(Text, default=None)

    attempt: Mapped["Attempt"] = relationship(back_populates="writing_submissions")
