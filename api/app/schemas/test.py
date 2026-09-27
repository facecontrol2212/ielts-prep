import uuid
from typing import Any

from pydantic import BaseModel

from app.models.enums import QuestionType, Skill, Variant
from app.schemas.common import ORMModel


class TestSummary(ORMModel):
    """Card shown in the test catalogue. No content, no answers."""

    id: uuid.UUID
    slug: str
    skill: Skill
    variant: Variant
    title: str
    description: str | None
    difficulty: int
    duration_seconds: int
    question_count: int


class OptionOut(BaseModel):
    label: str
    text: str


class QuestionOut(ORMModel):
    """Student-facing question. MUST NOT contain the answer key."""

    id: uuid.UUID
    number: int
    type: QuestionType
    prompt: str
    options: list[OptionOut] | None = None
    word_limit: int | None = None
    allow_number: bool = False


class QuestionGroupOut(ORMModel):
    id: uuid.UUID
    order: int
    type: QuestionType
    instructions: str
    word_limit: int | None
    allow_number: bool
    options: list[OptionOut] | None
    select_count: int | None
    content_html: str | None
    image_url: str | None
    questions: list[QuestionOut]


class SectionOut(ORMModel):
    id: uuid.UUID
    order: int
    title: str
    instructions: str | None
    passage_html: str | None
    audio_url: str | None
    prompt_html: str | None
    image_url: str | None
    min_words: int | None
    start_question: int | None
    end_question: int | None
    groups: list[QuestionGroupOut] = []


class TestDetail(TestSummary):
    """Full exam payload, served only when an attempt is started."""

    transfer_seconds: int
    sections: list[SectionOut]


# ---------------------------------------------------------------- review (post-submit)


class QuestionReview(BaseModel):
    """Per-question review, served only after an attempt is scored."""

    question_id: uuid.UUID
    number: int
    type: QuestionType
    prompt: str
    your_answer: Any | None
    correct_answers: list[str]
    is_correct: bool
    reason: str | None
    explanation: str | None
    evidence: str | None
    audio_timestamp: int | None
