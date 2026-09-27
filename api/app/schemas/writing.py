import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class WritingDraft(BaseModel):
    section_id: uuid.UUID
    task_number: int = Field(ge=1, le=2)
    text: str = ""


class Correction(BaseModel):
    """An inline fix anchored to a character range of the student's text."""

    offset: int
    length: int
    original: str
    suggestion: str
    issue: str  # grammar | vocabulary | cohesion | spelling | punctuation | register
    explanation: str


class WritingFeedback(BaseModel):
    band_task: float = Field(ge=0, le=9)
    band_coherence: float = Field(ge=0, le=9)
    band_lexical: float = Field(ge=0, le=9)
    band_grammar: float = Field(ge=0, le=9)
    band_overall: float = Field(ge=0, le=9)
    strengths: list[str]
    improvements: list[str]
    corrections: list[Correction]
    improved_paragraph: str | None = None
    off_topic: bool = False
    under_length_penalty: bool = False


class WritingSubmissionOut(ORMModel):
    id: uuid.UUID
    task_number: int
    text: str
    word_count: int
    band_task: float | None
    band_coherence: float | None
    band_lexical: float | None
    band_grammar: float | None
    band_overall: float | None
    feedback: dict | None
    graded_at: datetime | None
    grading_error: str | None
