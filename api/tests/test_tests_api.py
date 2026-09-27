"""GET /api/tests and GET /api/tests/{slug} — the public-ish catalogue.

The catalogue is the easiest place to leak an exam by accident, so as well as the
filtering/pagination checks there are explicit assertions that no content and no
answer ever appears in a TestSummary.
"""

import pytest

from app.models.enums import Skill, Variant
from app.models.test import Test as ExamTest

CATALOGUE = "/api/tests"


@pytest.fixture
def catalogue(db, reading_test) -> dict[str, ExamTest]:
    """reading_test (published, academic, difficulty 3) plus three more rows."""
    extra = {
        "listening": ExamTest(
            slug="listening-fixture-1",
            skill=Skill.LISTENING,
            variant=Variant.ACADEMIC,
            title="Listening Fixture Test",
            difficulty=5,
            duration_seconds=1800,
            transfer_seconds=120,
            question_count=40,
            is_published=True,
        ),
        "general": ExamTest(
            slug="reading-general-1",
            skill=Skill.READING,
            variant=Variant.GENERAL,
            title="General Training Reading",
            difficulty=2,
            question_count=40,
            is_published=True,
        ),
        "draft": ExamTest(
            slug="reading-draft-1",
            skill=Skill.READING,
            variant=Variant.ACADEMIC,
            title="Unfinished Draft",
            difficulty=3,
            question_count=40,
            is_published=False,
        ),
    }
    db.add_all(extra.values())
    db.commit()
    return {"reading": reading_test, **extra}


def slugs(payload: dict) -> set[str]:
    return {item["slug"] for item in payload["items"]}


# ------------------------------------------------------------------ auth


def test_list_requires_a_token(client, catalogue):
    assert client.get(CATALOGUE).status_code == 401


def test_detail_requires_a_token(client, catalogue):
    assert client.get(f"{CATALOGUE}/reading-fixture-1").status_code == 401


def test_a_garbage_token_is_401(client, catalogue):
    r = client.get(CATALOGUE, headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


# ------------------------------------------------------------------ listing


def test_list_returns_published_tests_only(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert slugs(body) == {"reading-fixture-1", "listening-fixture-1", "reading-general-1"}
    assert "reading-draft-1" not in slugs(body)


def test_filter_by_skill(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, params={"skill": "reading"}, headers=auth_headers)
    assert r.status_code == 200
    assert slugs(r.json()) == {"reading-fixture-1", "reading-general-1"}
    assert r.json()["total"] == 2


def test_filter_by_variant(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, params={"variant": "general"}, headers=auth_headers)
    assert slugs(r.json()) == {"reading-general-1"}


def test_filter_by_difficulty(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, params={"difficulty": 5}, headers=auth_headers)
    assert slugs(r.json()) == {"listening-fixture-1"}


def test_filters_combine(client, auth_headers, catalogue):
    r = client.get(
        CATALOGUE, params={"skill": "reading", "variant": "academic"}, headers=auth_headers
    )
    assert slugs(r.json()) == {"reading-fixture-1"}


def test_unknown_filter_value_is_422(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, params={"skill": "telepathy"}, headers=auth_headers)
    assert r.status_code == 422
    assert client.get(CATALOGUE, params={"difficulty": 9}, headers=auth_headers).status_code == 422


def test_pagination_splits_the_catalogue(client, auth_headers, catalogue):
    first = client.get(CATALOGUE, params={"page": 1, "page_size": 2}, headers=auth_headers).json()
    second = client.get(CATALOGUE, params={"page": 2, "page_size": 2}, headers=auth_headers).json()

    assert first["total"] == second["total"] == 3
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1
    assert first["page"] == 1 and first["page_size"] == 2
    assert not slugs(first) & slugs(second), "pages must not overlap"
    assert slugs(first) | slugs(second) == {
        "reading-fixture-1",
        "listening-fixture-1",
        "reading-general-1",
    }


def test_page_past_the_end_is_empty_not_an_error(client, auth_headers, catalogue):
    r = client.get(CATALOGUE, params={"page": 99}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 3


# ------------------------------------------------------------------ detail


def test_get_test_by_slug(client, auth_headers, catalogue):
    r = client.get(f"{CATALOGUE}/reading-fixture-1", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "reading-fixture-1"
    assert body["skill"] == "reading"
    assert body["question_count"] == 4
    assert body["duration_seconds"] == 3600


def test_unknown_slug_is_404(client, auth_headers, catalogue):
    assert client.get(f"{CATALOGUE}/nope", headers=auth_headers).status_code == 404


def test_unpublished_test_is_404(client, auth_headers, catalogue):
    assert client.get(f"{CATALOGUE}/reading-draft-1", headers=auth_headers).status_code == 404


# ------------------------------------------------------------------ leak guards


def test_catalogue_never_serialises_content_or_answers(client, auth_headers, catalogue):
    """TestSummary is metadata. No passage, no questions, no key — anywhere."""
    for body in (
        client.get(CATALOGUE, headers=auth_headers).text,
        client.get(f"{CATALOGUE}/reading-fixture-1", headers=auth_headers).text,
    ):
        for forbidden in (
            "largest coral reef system",  # an accepted answer, and the passage text
            "passage_html",
            "sections",
            "questions",
            "answer_key",
            "accepted",
            "transcript",
        ):
            assert forbidden not in body, f"catalogue leaked {forbidden!r}"


def test_summary_exposes_exactly_the_contracted_fields(client, auth_headers, catalogue):
    body = client.get(f"{CATALOGUE}/reading-fixture-1", headers=auth_headers).json()
    assert set(body) == {
        "id",
        "slug",
        "skill",
        "variant",
        "title",
        "description",
        "difficulty",
        "duration_seconds",
        "question_count",
    }
