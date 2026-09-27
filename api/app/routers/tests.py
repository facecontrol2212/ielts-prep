"""Test catalogue. See docs/api-contract.md.

This module serves metadata only. It must never reach a question, an option pool
or an answer key: ``TestSummary`` has no content fields, and the queries below never
join past ``tests``. The full exam payload is served exactly once, by
``POST /api/attempts`` (see ``app.services.attempt_service.build_session``).
"""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Select, func, select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import NotFound
from app.models.enums import Skill, Variant
from app.models.test import Test
from app.schemas.common import Page
from app.schemas.test import TestSummary

router = APIRouter()


def _published() -> Select[tuple[Test]]:
    return select(Test).where(Test.is_published.is_(True))


@router.get("", response_model=Page[TestSummary])
def list_tests(
    db: DbSession,
    user: CurrentUser,
    skill: Skill | None = None,
    variant: Variant | None = None,
    difficulty: Annotated[int | None, Query(ge=1, le=5)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[TestSummary]:
    """Published tests only, newest first. Filters are all optional and ANDed."""
    stmt = _published()
    if skill is not None:
        stmt = stmt.where(Test.skill == skill)
    if variant is not None:
        stmt = stmt.where(Test.variant == variant)
    if difficulty is not None:
        stmt = stmt.where(Test.difficulty == difficulty)

    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    # TestSummary has no relationships, so a plain SELECT is already N+1-free;
    # the eager loading lives in attempt_service.load_test_detail, where the
    # sections -> groups -> questions tree would otherwise fan out.
    rows = (
        db.execute(
            stmt.order_by(Test.created_at.desc(), Test.slug)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return Page[TestSummary](
        items=[TestSummary.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{slug}", response_model=TestSummary)
def get_test(slug: str, db: DbSession, user: CurrentUser) -> TestSummary:
    """Catalogue detail: metadata only. An unpublished test is a 404, not a 403."""
    test = db.execute(_published().where(Test.slug == slug)).scalar_one_or_none()
    if test is None:
        raise NotFound("Test")
    return TestSummary.model_validate(test)
