"""Shared fixtures. Tests run against in-memory SQLite: no Docker needed."""

import os
import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.api.deps import get_db  # noqa: E402
from app.core.security import create_token, hash_password  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    AnswerKey,
    Attempt,
    Base,
    Question,
    QuestionGroup,
    Section,
    Test,
    User,
)
from app.models.enums import (  # noqa: E402
    AttemptStatus,
    MatchMode,
    QuestionType,
    Skill,
    Variant,
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def db(engine) -> Generator[Session, None, None]:
    """A session wrapped in a transaction that is rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def app(db):
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db
    return application


@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


# ------------------------------------------------------------------ data factories


@pytest.fixture
def user(db) -> User:
    u = User(
        email=f"student-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("password123"),
        full_name="Test Student",
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def admin_user(db) -> User:
    u = User(
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("password123"),
        is_verified=True,
        is_admin=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def auth_headers(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(user.id, 'access')}"}


@pytest.fixture
def admin_headers(admin_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(admin_user.id, 'access')}"}


@pytest.fixture
def reading_test(db) -> Test:
    """A tiny but structurally real reading test: 1 passage, 4 questions, 3 types."""
    test = Test(
        slug="reading-fixture-1",
        skill=Skill.READING,
        variant=Variant.ACADEMIC,
        title="Reading Fixture Test",
        duration_seconds=3600,
        question_count=4,
        is_published=True,
    )
    section = Section(
        order=1,
        title="Passage 1",
        passage_html="<p>The Great Barrier Reef is the world's largest coral reef system.</p>",
        start_question=1,
        end_question=4,
    )
    test.sections.append(section)

    group = QuestionGroup(
        order=1,
        type=QuestionType.SENTENCE_COMPLETION,
        instructions="Complete the sentences. NO MORE THAN TWO WORDS.",
        word_limit=2,
    )
    section.questions.extend(
        [
            Question(
                number=1, type=QuestionType.SENTENCE_COMPLETION, prompt="The reef is the ___."
            ),
            Question(
                number=2,
                type=QuestionType.TRUE_FALSE_NOT_GIVEN,
                prompt="The reef is visible from space.",
                options=[
                    {"label": "TRUE", "text": "True"},
                    {"label": "FALSE", "text": "False"},
                    {"label": "NOT GIVEN", "text": "Not Given"},
                ],
            ),
            Question(
                number=3,
                type=QuestionType.MULTIPLE_CHOICE,
                prompt="Where is the reef?",
                options=[{"label": "A", "text": "Australia"}, {"label": "B", "text": "Brazil"}],
            ),
            Question(
                number=4,
                type=QuestionType.SHORT_ANSWER,
                prompt="What colour is coral?",
                word_limit=1,
            ),
        ]
    )
    group.questions = list(section.questions)
    section.groups.append(group)
    db.add(test)
    db.flush()

    keys = {
        1: (["largest coral reef system", "largest"], MatchMode.NORMALISED),
        2: (["TRUE"], MatchMode.OPTION),
        3: (["A"], MatchMode.OPTION),
        4: (["colour", "color"], MatchMode.NORMALISED),
    }
    for q in section.questions:
        accepted, mode = keys[q.number]
        db.add(AnswerKey(question_id=q.id, accepted=accepted, match_mode=mode))
    db.commit()
    return test


@pytest.fixture
def attempt(db, user, reading_test) -> Attempt:
    now = datetime.now(UTC)
    a = Attempt(
        user_id=user.id,
        test_id=reading_test.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        expires_at=now + timedelta(seconds=reading_test.duration_seconds),
    )
    db.add(a)
    db.commit()
    return a
