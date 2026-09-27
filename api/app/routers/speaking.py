"""Speaking question bank.

No AI in v1: the student reads the question, records in the browser and compares against a
band-7+ model answer. See docs/api-contract.md.
"""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import NotFound
from app.models.content import SpeakingQuestion
from app.models.enums import SpeakingPart
from app.schemas.common import Page
from app.schemas.content import SpeakingQuestionOut

router = APIRouter()

PartFilter = Annotated[SpeakingPart | None, Query(description="part_1 | part_2 | part_3")]


@router.get("/questions", response_model=Page[SpeakingQuestionOut])
def list_questions(
    db: DbSession,
    _user: CurrentUser,
    part: PartFilter = None,
    topic: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[SpeakingQuestionOut]:
    filters = []
    if part is not None:
        filters.append(SpeakingQuestion.part == part)
    if topic:
        filters.append(SpeakingQuestion.topic == topic)

    total = db.scalar(select(func.count()).select_from(SpeakingQuestion).where(*filters)) or 0
    rows = db.scalars(
        select(SpeakingQuestion)
        .where(*filters)
        .order_by(SpeakingQuestion.part, SpeakingQuestion.topic, SpeakingQuestion.created_at)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return Page[SpeakingQuestionOut](
        items=[SpeakingQuestionOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/questions/random", response_model=SpeakingQuestionOut)
def random_question(
    db: DbSession,
    _user: CurrentUser,
    part: PartFilter = None,
    topic: str | None = None,
) -> SpeakingQuestion:
    filters = []
    if part is not None:
        filters.append(SpeakingQuestion.part == part)
    if topic:
        filters.append(SpeakingQuestion.topic == topic)

    row = db.scalar(select(SpeakingQuestion).where(*filters).order_by(func.random()).limit(1))
    if row is None:
        raise NotFound("Speaking question")
    return row


@router.get("/topics", response_model=list[str])
def list_topics(db: DbSession, _user: CurrentUser, part: PartFilter = None) -> list[str]:
    stmt = select(SpeakingQuestion.topic).distinct().order_by(SpeakingQuestion.topic)
    if part is not None:
        stmt = stmt.where(SpeakingQuestion.part == part)
    return list(db.scalars(stmt).all())
