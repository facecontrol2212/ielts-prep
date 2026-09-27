"""Admin content operations: import a content document, publish a test, see the numbers.

Every route requires ``CurrentAdmin`` — a logged-in non-admin gets 403, an anonymous
caller gets 401. The import endpoint runs the *same* validation and the *same* importer as
`python -m app.cli import`, so the admin UI can never create content the CLI would reject.
"""

import uuid

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.core.errors import Conflict, NotFound
from app.models.attempt import Attempt
from app.models.content import SpeakingQuestion
from app.models.enums import AttemptStatus
from app.models.test import Question, Test
from app.models.user import User
from app.schemas.content import AdminStats, ImportRequest, ImportSummaryOut, PublishRequest
from app.schemas.test import TestSummary
from app.services.importer import ImportRefused, import_document

router = APIRouter()


@router.post("/tests/import", response_model=list[ImportSummaryOut])
def import_content(
    db: DbSession,
    _admin: CurrentAdmin,
    payload: ImportRequest,
) -> list[ImportSummaryOut]:
    """Import a content JSON document. A malformed document is a 422 from pydantic."""
    try:
        summaries = import_document(db, payload.document, force=payload.force)
    except ImportRefused as exc:
        raise Conflict(str(exc)) from exc
    return [ImportSummaryOut(**s.as_dict()) for s in summaries]


@router.patch("/tests/{test_id}/publish", response_model=TestSummary)
def set_published(
    db: DbSession,
    _admin: CurrentAdmin,
    test_id: uuid.UUID,
    payload: PublishRequest | None = None,
) -> Test:
    """Publish or unpublish a test. With no body the current value is flipped."""
    test = db.get(Test, test_id)
    if test is None:
        raise NotFound("Test")
    desired = payload.is_published if payload and payload.is_published is not None else None
    test.is_published = (not test.is_published) if desired is None else desired
    db.commit()
    db.refresh(test)
    return test


@router.get("/stats", response_model=AdminStats)
def stats(db: DbSession, _admin: CurrentAdmin) -> AdminStats:
    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    return AdminStats(
        users=count(User),
        admins=count(User, User.is_admin.is_(True)),
        tests=count(Test),
        published_tests=count(Test, Test.is_published.is_(True)),
        questions=count(Question),
        attempts=count(Attempt),
        scored_attempts=count(Attempt, Attempt.status == AttemptStatus.SCORED),
        speaking_questions=count(SpeakingQuestion),
    )
