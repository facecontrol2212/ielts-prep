from typing import Any

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import SpeakingPart


class SpeakingQuestion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "speaking_questions"

    part: Mapped[SpeakingPart] = mapped_column(String(10), index=True)
    topic: Mapped[str] = mapped_column(String(120), index=True)
    question: Mapped[str] = mapped_column(Text)
    #: Part 2 cue card bullets
    cue_points: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    model_answer: Mapped[str | None] = mapped_column(Text, default=None)
    useful_phrases: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    band_target: Mapped[float | None] = mapped_column(default=None)


class VocabItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "vocab_items"

    word: Mapped[str] = mapped_column(String(120), index=True)
    part_of_speech: Mapped[str | None] = mapped_column(String(32), default=None)
    definition: Mapped[str] = mapped_column(Text)
    translation_uz: Mapped[str | None] = mapped_column(Text, default=None)
    translation_ru: Mapped[str | None] = mapped_column(Text, default=None)
    example: Mapped[str | None] = mapped_column(Text, default=None)
    topic: Mapped[str | None] = mapped_column(String(80), index=True, default=None)
    cefr_level: Mapped[str | None] = mapped_column(String(4), default=None)
    frequency_rank: Mapped[int | None] = mapped_column(Integer, default=None)
