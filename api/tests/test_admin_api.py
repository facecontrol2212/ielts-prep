"""Admin content endpoints: import, publish, stats.

Access control is the point of half of these: a student must never reach them.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import AnswerKey, Attempt, Question, Test
from app.models.enums import AttemptStatus

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"
READING_FILE = CONTENT_DIR / "reading" / "academic-01.json"


def small_document() -> dict:
    return {
        "kind": "test",
        "slug": "admin-reading-01",
        "skill": "reading",
        "variant": "academic",
        "title": "Admin Imported Test",
        "question_count": 2,
        "sections": [
            {
                "order": 1,
                "title": "Passage 1",
                "passage_html": "<p>The lake freezes in January. Boats return in April.</p>",
                "groups": [
                    {
                        "order": 1,
                        "type": "true_false_not_given",
                        "instructions": "Write TRUE, FALSE or NOT GIVEN.",
                        "questions": [
                            {
                                "number": 1,
                                "prompt": "The lake freezes in winter.",
                                "evidence": "The lake freezes in January.",
                                "answer": {"accepted": ["TRUE"], "explanation": "Stated."},
                            }
                        ],
                    },
                    {
                        "order": 2,
                        "type": "sentence_completion",
                        "instructions": "Choose NO MORE THAN TWO WORDS from the passage.",
                        "word_limit": 2,
                        "questions": [
                            {
                                "number": 2,
                                "prompt": "Boats come back in __________.",
                                "evidence": "Boats return in April.",
                                "answer": {"accepted": ["April"], "explanation": "Stated."},
                            }
                        ],
                    },
                ],
            }
        ],
    }


@pytest.fixture
def imported_test(client, admin_headers) -> dict:
    r = client.post(
        "/api/admin/tests/import",
        headers=admin_headers,
        json={"document": small_document()},
    )
    assert r.status_code == 200, r.text
    return r.json()[0]


def _call(client, method, path, **kwargs):
    if method == "get":
        return client.get(path, **kwargs)
    return getattr(client, method)(path, json={}, **kwargs)


# -------------------------------------------------------------------- access control


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/admin/tests/import"),
        ("patch", f"/api/admin/tests/{uuid.uuid4()}/publish"),
        ("get", "/api/admin/stats"),
    ],
)
def test_admin_routes_reject_anonymous_callers(client, method, path):
    r = _call(client, method, path)
    assert r.status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/admin/tests/import"),
        ("patch", f"/api/admin/tests/{uuid.uuid4()}/publish"),
        ("get", "/api/admin/stats"),
    ],
)
def test_admin_routes_are_403_for_a_normal_user(client, auth_headers, method, path):
    r = _call(client, method, path, headers=auth_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "Admin only"


def test_a_student_cannot_import_content(client, auth_headers, db):
    r = client.post(
        "/api/admin/tests/import",
        headers=auth_headers,
        json={"document": small_document()},
    )
    assert r.status_code == 403
    assert db.scalar(select(func.count()).select_from(Test)) == 0


# -------------------------------------------------------------------------- import


def test_admin_can_import_a_document(client, admin_headers, db):
    r = client.post(
        "/api/admin/tests/import",
        headers=admin_headers,
        json={"document": small_document()},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    summary = body[0]
    assert summary["action"] == "created"
    assert summary["kind"] == "test"
    assert summary["slug"] == "admin-reading-01"
    assert summary["skill"] == "reading"
    assert (summary["sections"], summary["groups"], summary["questions"]) == (1, 2, 2)
    assert summary["answer_keys"] == 2
    assert summary["warnings"] == []

    test = db.scalar(select(Test).where(Test.slug == "admin-reading-01"))
    assert test is not None
    assert str(test.id) == summary["test_id"]
    assert db.scalar(select(func.count()).select_from(Question)) == 2
    assert db.scalar(select(func.count()).select_from(AnswerKey)) == 2


def test_reimport_through_the_api_updates_in_place(client, admin_headers, imported_test, db):
    doc = small_document()
    doc["title"] = "Admin Imported Test (v2)"
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": doc})
    assert r.status_code == 200
    assert r.json()[0]["action"] == "updated"
    assert r.json()[0]["test_id"] == imported_test["test_id"]
    assert db.scalar(select(func.count()).select_from(Test)) == 1
    assert db.scalar(select(func.count()).select_from(Question)) == 2


def test_the_api_rejects_an_invalid_document_with_the_question_number(client, admin_headers):
    doc = small_document()
    doc["sections"][0]["groups"][0]["questions"][0]["answer"]["accepted"] = ["MAYBE"]
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": doc})
    assert r.status_code == 422
    assert "Q1" in json.dumps(r.json())


def test_the_api_rejects_a_document_whose_count_is_wrong(client, admin_headers):
    doc = small_document()
    doc["question_count"] = 40
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": doc})
    assert r.status_code == 422
    assert "question_count says 40" in json.dumps(r.json())


def test_import_is_409_when_the_test_has_scored_attempts(
    client, admin_headers, imported_test, db, user
):
    now = datetime.now(UTC)
    db.add(
        Attempt(
            user_id=user.id,
            test_id=uuid.UUID(imported_test["test_id"]),
            status=AttemptStatus.SCORED,
            started_at=now,
            expires_at=now + timedelta(hours=1),
        )
    )
    db.commit()

    r = client.post(
        "/api/admin/tests/import",
        headers=admin_headers,
        json={"document": small_document()},
    )
    assert r.status_code == 409
    assert "scored attempt" in r.json()["detail"]

    forced = client.post(
        "/api/admin/tests/import",
        headers=admin_headers,
        json={"document": small_document(), "force": True},
    )
    assert forced.status_code == 200
    assert forced.json()[0]["action"] == "updated"


def test_importing_the_real_reading_test_through_the_api(client, admin_headers, db):
    document = json.loads(READING_FILE.read_text(encoding="utf-8"))
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": document})
    assert r.status_code == 200, r.text
    summary = r.json()[0]
    assert summary["questions"] == 40
    assert summary["answer_keys"] == 40
    assert db.scalar(select(func.count()).select_from(Question)) == 40


def test_importing_a_writing_prompt_set_returns_one_summary_per_prompt(client, admin_headers):
    document = {
        "kind": "writing_prompts",
        "prompts": [
            {
                "slug": "admin-writing-t1",
                "task_number": 1,
                "title": "Energy",
                "prompt_html": "<p>The chart below shows household energy use.</p>",
                "visual_description": (
                    "A bar chart of household energy use in 2024 as a percentage of the total. "
                    "Space heating accounts for 44 per cent, water heating 22 per cent, "
                    "appliances 20 per cent and lighting 14 per cent. The vertical axis runs "
                    "from zero to fifty per cent in steps of ten."
                ),
            },
            {
                "slug": "admin-writing-t2",
                "task_number": 2,
                "title": "Remote work",
                "prompt_html": "<p>To what extent do you agree?</p>",
            },
        ],
    }
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": document})
    assert r.status_code == 200, r.text
    assert [s["slug"] for s in r.json()] == ["admin-writing-t1", "admin-writing-t2"]
    assert all(s["questions"] == 0 for s in r.json())


def test_importing_a_speaking_bank_through_the_api(client, admin_headers):
    document = {
        "kind": "speaking_bank",
        "questions": [
            {
                "part": "part_1",
                "topic": "Hometown",
                "question": "Where do you live?",
                "model_answer": "In a quiet district on the edge of Tashkent.",
            }
        ],
    }
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": document})
    assert r.status_code == 200, r.text
    assert r.json()[0]["kind"] == "speaking_bank"
    assert r.json()[0]["items"] == 1


def test_a_document_without_a_kind_is_rejected(client, admin_headers):
    doc = small_document()
    doc.pop("kind")
    r = client.post("/api/admin/tests/import", headers=admin_headers, json={"document": doc})
    assert r.status_code == 422


# ------------------------------------------------------------------------- publish


def test_publish_toggles_when_no_body_is_sent(client, admin_headers, imported_test, db):
    test_id = imported_test["test_id"]
    assert db.get(Test, uuid.UUID(test_id)).is_published is False

    r = client.patch(f"/api/admin/tests/{test_id}/publish", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["id"] == test_id
    assert db.get(Test, uuid.UUID(test_id)).is_published is True

    r = client.patch(f"/api/admin/tests/{test_id}/publish", headers=admin_headers)
    assert r.status_code == 200
    assert db.get(Test, uuid.UUID(test_id)).is_published is False


def test_publish_accepts_an_explicit_value(client, admin_headers, imported_test, db):
    test_id = imported_test["test_id"]
    for value in (True, True, False):
        r = client.patch(
            f"/api/admin/tests/{test_id}/publish",
            headers=admin_headers,
            json={"is_published": value},
        )
        assert r.status_code == 200
        assert db.get(Test, uuid.UUID(test_id)).is_published is value


def test_publish_response_is_a_test_summary_without_content(client, admin_headers, imported_test):
    r = client.patch(f"/api/admin/tests/{imported_test['test_id']}/publish", headers=admin_headers)
    body = r.json()
    assert body["slug"] == "admin-reading-01"
    assert body["question_count"] == 2
    assert "sections" not in body
    assert "questions" not in body


def test_publish_is_404_for_an_unknown_test(client, admin_headers):
    r = client.patch(f"/api/admin/tests/{uuid.uuid4()}/publish", headers=admin_headers)
    assert r.status_code == 404
    assert r.json()["detail"] == "Test not found"


# --------------------------------------------------------------------------- stats


def test_stats_counts_what_exists(client, admin_headers, admin_user, user, imported_test, db):
    now = datetime.now(UTC)
    db.add(
        Attempt(
            user_id=user.id,
            test_id=uuid.UUID(imported_test["test_id"]),
            status=AttemptStatus.SCORED,
            started_at=now,
            expires_at=now + timedelta(hours=1),
            raw_score=2,
            band=9.0,
        )
    )
    db.commit()

    r = client.get("/api/admin/stats", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["users"] == 2
    assert body["admins"] == 1
    assert body["tests"] == 1
    assert body["published_tests"] == 0
    assert body["questions"] == 2
    assert body["attempts"] == 1
    assert body["scored_attempts"] == 1
    assert body["speaking_questions"] == 0


def test_stats_on_an_empty_database(client, admin_headers):
    body = client.get("/api/admin/stats", headers=admin_headers).json()
    assert body["tests"] == 0
    assert body["questions"] == 0
    assert body["attempts"] == 0
