"""API tests for /api/writing. A fake Claude is installed globally: no network, ever."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.config import settings
from app.core.security import create_token, hash_password
from app.models.attempt import Attempt, WritingSubmission
from app.models.enums import AttemptStatus, Skill, Variant
from app.models.test import Section
from app.models.test import Test as ExamTest
from app.models.user import User
from app.services.ai import client as ai_client
from app.services.ai import writing_grader
from app.services.ai.client import LLMResponse
from app.services.ai.writing_grader import InMemoryGradeCache

TASK1_PROMPT = "<p>The chart below shows electricity production by source.</p>"
TASK2_PROMPT = "<p>Some people believe that X. Discuss both views and give your opinion.</p>"


def feedback_json(**overrides: Any) -> str:
    payload: dict[str, Any] = {
        "band_task": 6.0,
        "band_coherence": 6.5,
        "band_lexical": 6.0,
        "band_grammar": 5.5,
        "band_overall": 6.0,
        "strengths": ["Clear overview"],
        "improvements": ["Group the data", "Fix articles", "Vary linkers"],
        "corrections": [],
        "improved_paragraph": "Rewritten.",
        "off_topic": False,
        "under_length_penalty": False,
    }
    payload.update(overrides)
    return json.dumps(payload)


class FakeClaude:
    def __init__(self, responses: list[str] | None = None, model: str = "claude-sonnet-5") -> None:
        self._responses = list(responses or [feedback_json()])
        self.model = model
        self.calls: list[dict[str, Any]] = []

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 8000,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse:
        self.calls.append({"system": system, "messages": messages})
        index = min(len(self.calls) - 1, len(self._responses) - 1)
        return LLMResponse(
            text=self._responses[index],
            model=self.model,
            input_tokens=1500,
            output_tokens=800,
        )

    @property
    def call_count(self) -> int:
        return len(self.calls)


def words(n: int, word: str = "reliable") -> str:
    return " ".join([word] * n)


# --------------------------------------------------------------------------- fixtures


@pytest.fixture(autouse=True)
def isolated_ai() -> Any:
    """Never let a real Anthropic client or a shared cache leak between tests."""
    fake = FakeClaude()
    ai_client.set_llm_client(fake)
    writing_grader.set_grade_cache(InMemoryGradeCache())
    yield fake
    ai_client.set_llm_client(None)
    writing_grader.set_grade_cache(InMemoryGradeCache())


@pytest.fixture
def writing_test(db) -> ExamTest:
    test = ExamTest(
        slug=f"writing-fixture-{uuid.uuid4().hex[:6]}",
        skill=Skill.WRITING,
        variant=Variant.ACADEMIC,
        title="Writing Fixture Test",
        duration_seconds=3600,
        question_count=2,
        is_published=True,
    )
    test.sections.append(Section(order=1, title="Task 1", prompt_html=TASK1_PROMPT, min_words=150))
    test.sections.append(Section(order=2, title="Task 2", prompt_html=TASK2_PROMPT, min_words=250))
    db.add(test)
    db.commit()
    return test


@pytest.fixture
def writing_attempt(db, user, writing_test) -> Attempt:
    now = datetime.now(UTC)
    attempt = Attempt(
        user_id=user.id,
        test_id=writing_test.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        expires_at=now + timedelta(seconds=writing_test.duration_seconds),
    )
    db.add(attempt)
    db.commit()
    return attempt


@pytest.fixture
def other_headers(db) -> dict[str, str]:
    other = User(
        email=f"other-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("password123"),
        is_verified=True,
    )
    db.add(other)
    db.commit()
    return {"Authorization": f"Bearer {create_token(other.id, 'access')}"}


def draft_body(section: Section, task_number: int, text: str) -> dict[str, Any]:
    return {"section_id": str(section.id), "task_number": task_number, "text": text}


def save_both_tasks(client, writing_attempt, writing_test, auth_headers, *, t1=160, t2=280):
    for section, task_number, count in (
        (writing_test.sections[0], 1, t1),
        (writing_test.sections[1], 2, t2),
    ):
        response = client.put(
            f"/api/writing/attempts/{writing_attempt.id}/draft",
            json=draft_body(section, task_number, words(count)),
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text


# --------------------------------------------------------------------------- draft


def test_draft_creates_and_counts_words(client, writing_attempt, writing_test, auth_headers):
    section = writing_test.sections[0]
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(section, 1, "A well-known fact about 1,500 units."),
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["task_number"] == 1
    assert body["word_count"] == 6  # A / well-known / fact / about / 1,500 / units
    assert body["band_overall"] is None


def test_draft_is_an_idempotent_upsert(client, db, writing_attempt, writing_test, auth_headers):
    section = writing_test.sections[1]
    url = f"/api/writing/attempts/{writing_attempt.id}/draft"

    first = client.put(url, json=draft_body(section, 2, "one two three"), headers=auth_headers)
    second = client.put(url, json=draft_body(section, 2, "one two"), headers=auth_headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["word_count"] == 2
    assert db.query(WritingSubmission).count() == 1


def test_draft_requires_ownership(client, writing_attempt, writing_test, other_headers):
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(writing_test.sections[0], 1, "text"),
        headers=other_headers,
    )
    assert response.status_code == 403


def test_draft_requires_authentication(client, writing_attempt, writing_test):
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(writing_test.sections[0], 1, "text"),
    )
    assert response.status_code == 401


def test_draft_rejects_a_section_from_another_test(
    client, db, writing_attempt, reading_test, auth_headers
):
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(reading_test.sections[0], 1, "text"),
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_draft_on_unknown_attempt_is_404(client, writing_test, auth_headers):
    response = client.put(
        f"/api/writing/attempts/{uuid.uuid4()}/draft",
        json=draft_body(writing_test.sections[0], 1, "text"),
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_draft_rejected_once_the_attempt_is_scored(
    client, db, writing_attempt, writing_test, auth_headers
):
    writing_attempt.status = AttemptStatus.SCORED
    db.add(writing_attempt)
    db.commit()
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(writing_test.sections[0], 1, "text"),
        headers=auth_headers,
    )
    assert response.status_code == 409


def test_draft_rejects_an_invalid_task_number(client, writing_attempt, writing_test, auth_headers):
    response = client.put(
        f"/api/writing/attempts/{writing_attempt.id}/draft",
        json=draft_body(writing_test.sections[0], 3, "text"),
        headers=auth_headers,
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- grade


def test_grade_scores_every_task_and_records_tokens(
    client, db, writing_attempt, writing_test, auth_headers, isolated_ai
):
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)

    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["task_number"] for row in body] == [1, 2]
    for row in body:
        assert row["band_overall"] == 6.0  # (6.0 + 6.5 + 6.0 + 5.5) / 4 = 6.0
        assert row["grading_error"] is None
        assert row["graded_at"] is not None
        assert row["feedback"]["improvements"]

    rows = db.query(WritingSubmission).order_by(WritingSubmission.task_number).all()
    for row in rows:
        assert row.model == "claude-sonnet-5"
        assert row.input_tokens == 1500
        assert row.output_tokens == 800
    assert isolated_ai.call_count == 2


def test_grade_applies_the_under_length_penalty_end_to_end(
    client, db, writing_attempt, writing_test, auth_headers
):
    save_both_tasks(client, writing_attempt, writing_test, auth_headers, t1=90, t2=280)

    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=auth_headers
    )
    assert response.status_code == 200
    task1, task2 = response.json()

    assert task1["feedback"]["under_length_penalty"] is True
    assert task1["band_task"] == 5.0  # 90/150 = 0.60
    assert task2["feedback"]["under_length_penalty"] is False
    assert task2["band_task"] == 6.0


def test_grade_requires_ownership(
    client, writing_attempt, writing_test, auth_headers, other_headers
):
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)
    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=other_headers
    )
    assert response.status_code == 403


def test_grade_with_nothing_saved_is_409(client, writing_attempt, auth_headers):
    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=auth_headers
    )
    assert response.status_code == 409


def test_grade_is_rate_limited_per_day(
    client, writing_attempt, writing_test, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "writing_submissions_per_day", 1)
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)

    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=auth_headers
    )
    assert response.status_code == 429
    assert "Daily AI writing limit" in response.json()["detail"]


def test_the_daily_allowance_is_consumed_by_grading(
    client, writing_attempt, writing_test, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "writing_submissions_per_day", 3)
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)
    url = f"/api/writing/attempts/{writing_attempt.id}/grade"

    assert client.post(url, headers=auth_headers).status_code == 200  # uses 2 of 3
    assert client.post(url, headers=auth_headers).status_code == 429  # 2 + 2 > 3


def test_regrading_identical_text_spends_no_tokens(
    client, writing_attempt, writing_test, auth_headers, monkeypatch, isolated_ai
):
    monkeypatch.setattr(settings, "writing_submissions_per_day", 100)
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)
    url = f"/api/writing/attempts/{writing_attempt.id}/grade"

    assert client.post(url, headers=auth_headers).status_code == 200
    assert isolated_ai.call_count == 2
    assert client.post(url, headers=auth_headers).status_code == 200
    assert isolated_ai.call_count == 2  # served from the cache


def test_a_model_failure_is_stored_not_raised(
    client, db, writing_attempt, writing_test, auth_headers
):
    ai_client.set_llm_client(FakeClaude(["nonsense", "still nonsense"]))
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)

    response = client.post(
        f"/api/writing/attempts/{writing_attempt.id}/grade", headers=auth_headers
    )
    assert response.status_code == 200
    for row in response.json():
        assert row["band_overall"] is None
        assert row["graded_at"] is None
        assert "grading failed after 2 attempts" in row["grading_error"]


# --------------------------------------------------------------------------- read back


def test_list_submissions(client, writing_attempt, writing_test, auth_headers):
    save_both_tasks(client, writing_attempt, writing_test, auth_headers)
    response = client.get(f"/api/writing/attempts/{writing_attempt.id}", headers=auth_headers)
    assert response.status_code == 200
    assert [row["task_number"] for row in response.json()] == [1, 2]


def test_list_submissions_requires_ownership(client, writing_attempt, other_headers):
    response = client.get(f"/api/writing/attempts/{writing_attempt.id}", headers=other_headers)
    assert response.status_code == 403


def test_list_submissions_is_empty_before_any_draft(client, writing_attempt, auth_headers):
    response = client.get(f"/api/writing/attempts/{writing_attempt.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []
