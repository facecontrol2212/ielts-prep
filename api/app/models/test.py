import uuid
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import MatchMode, QuestionType, Skill, Variant


class Test(UUIDMixin, TimestampMixin, Base):
    """A single mock test for one skill (e.g. 'Academic Reading Test 3')."""

    __tablename__ = "tests"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    skill: Mapped[Skill] = mapped_column(String(16), index=True)
    variant: Mapped[Variant] = mapped_column(String(16), default=Variant.ACADEMIC)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1..5
    duration_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    transfer_seconds: Mapped[int] = mapped_column(Integer, default=0)  # listening answer transfer
    question_count: Mapped[int] = mapped_column(Integer, default=40)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[str | None] = mapped_column(String(200), default=None)

    sections: Mapped[list["Section"]] = relationship(
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="Section.order",
    )


class Section(UUIDMixin, TimestampMixin, Base):
    """A part of a test: Listening Section 1-4, Reading Passage 1-3, Writing Task 1-2."""

    __tablename__ = "sections"
    __table_args__ = (UniqueConstraint("test_id", "order", name="uq_section_order"),)

    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"))
    order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str | None] = mapped_column(Text, default=None)

    # Reading
    passage_html: Mapped[str | None] = mapped_column(Text, default=None)
    # Listening
    audio_url: Mapped[str | None] = mapped_column(String(500), default=None)
    transcript: Mapped[str | None] = mapped_column(Text, default=None)
    # Writing
    prompt_html: Mapped[str | None] = mapped_column(Text, default=None)
    image_url: Mapped[str | None] = mapped_column(String(500), default=None)
    min_words: Mapped[int | None] = mapped_column(Integer, default=None)

    start_question: Mapped[int | None] = mapped_column(Integer, default=None)
    end_question: Mapped[int | None] = mapped_column(Integer, default=None)

    test: Mapped["Test"] = relationship(back_populates="sections")
    groups: Mapped[list["QuestionGroup"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="QuestionGroup.order",
    )
    questions: Mapped[list["Question"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="Question.number",
    )


class QuestionGroup(UUIDMixin, TimestampMixin, Base):
    """Consecutive questions sharing instructions, a word limit and an option pool.

    Example: 'Questions 14-18 — Choose the correct heading. NO MORE THAN TWO WORDS.'
    """

    __tablename__ = "question_groups"

    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"))
    order: Mapped[int] = mapped_column(Integer, default=1)
    type: Mapped[QuestionType] = mapped_column(String(40))
    instructions: Mapped[str] = mapped_column(Text)
    #: e.g. "NO MORE THAN TWO WORDS AND/OR A NUMBER" -> word_limit=2, allow_number=True
    word_limit: Mapped[int | None] = mapped_column(Integer, default=None)
    allow_number: Mapped[bool] = mapped_column(Boolean, default=False)
    #: shared option pool: [{"label": "A", "text": "..."}]
    options: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    #: for multi-answer groups: how many options must be selected
    select_count: Mapped[int | None] = mapped_column(Integer, default=None)
    content_html: Mapped[str | None] = mapped_column(Text, default=None)  # summary/table/diagram
    image_url: Mapped[str | None] = mapped_column(String(500), default=None)

    section: Mapped["Section"] = relationship(back_populates="groups")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="group", order_by="Question.number"
    )


class Question(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (UniqueConstraint("section_id", "number", name="uq_question_number"),)

    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_groups.id", ondelete="SET NULL"), default=None
    )
    number: Mapped[int] = mapped_column(Integer, index=True)
    type: Mapped[QuestionType] = mapped_column(String(40))
    prompt: Mapped[str] = mapped_column(Text, default="")
    #: question-specific options, overriding the group pool when present
    options: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    word_limit: Mapped[int | None] = mapped_column(Integer, default=None)
    allow_number: Mapped[bool] = mapped_column(Boolean, default=False)
    #: where in the passage/transcript the answer is found, shown in the review screen
    evidence: Mapped[str | None] = mapped_column(Text, default=None)
    audio_timestamp: Mapped[int | None] = mapped_column(Integer, default=None)  # seconds

    section: Mapped["Section"] = relationship(back_populates="questions")
    group: Mapped["QuestionGroup | None"] = relationship(back_populates="questions")
    answer_key: Mapped["AnswerKey"] = relationship(
        back_populates="question", cascade="all, delete-orphan", uselist=False
    )


class AnswerKey(UUIDMixin, TimestampMixin, Base):
    """The correct answer. NEVER serialised to a student-facing response."""

    __tablename__ = "answer_keys"

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), unique=True
    )
    #: every acceptable form: ["colour", "color"] or ["A"] or ["B", "D"] for option sets
    accepted: Mapped[list[str]] = mapped_column(JSON, default=list)
    match_mode: Mapped[MatchMode] = mapped_column(String(20), default=MatchMode.NORMALISED)
    #: articles that may be omitted/added, e.g. allow "the museum" for "museum"
    allow_optional_article: Mapped[bool] = mapped_column(Boolean, default=True)
    explanation: Mapped[str | None] = mapped_column(Text, default=None)

    question: Mapped["Question"] = relationship(back_populates="answer_key")


class BandTable(UUIDMixin, TimestampMixin, Base):
    """Raw score -> band conversion, stored as data so it can be corrected without a deploy."""

    __tablename__ = "band_tables"
    __table_args__ = (UniqueConstraint("skill", "variant", "raw_min", name="uq_band_row"),)

    skill: Mapped[Skill] = mapped_column(String(16), index=True)
    variant: Mapped[Variant] = mapped_column(String(16), default=Variant.ACADEMIC)
    raw_min: Mapped[int] = mapped_column(Integer)
    raw_max: Mapped[int] = mapped_column(Integer)
    band: Mapped[float] = mapped_column()
