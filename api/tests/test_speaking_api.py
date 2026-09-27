"""Speaking question bank endpoints."""

import pytest
from sqlalchemy import select

from app.models.content import SpeakingQuestion
from app.models.enums import SpeakingPart
from app.schemas.content import parse_document
from app.services.importer import import_speaking_bank

BANK = {
    "kind": "speaking_bank",
    "questions": [
        {
            "part": "part_1",
            "topic": "Hometown",
            "question": "Where is your hometown?",
            "model_answer": "I'm from Bukhara, an old city in the south of Uzbekistan.",
            "useful_phrases": [{"phrase": "on the outskirts of", "note": "just outside a city"}],
            "band_target": 7.0,
        },
        {
            "part": "part_1",
            "topic": "Food and cooking",
            "question": "Do you enjoy cooking?",
            "model_answer": "Not especially, though I can manage a decent plov at the weekend.",
            "band_target": 7.0,
        },
        {
            "part": "part_2",
            "topic": "A useful object",
            "question": "Describe an object you own that you find useful.",
            "cue_points": [
                "what it is",
                "where you got it",
                "how often you use it",
                "and explain why it matters to you",
            ],
            "model_answer": "word " * 130,
            "band_target": 7.5,
        },
        {
            "part": "part_3",
            "topic": "A useful object",
            "question": "Do people own too many possessions nowadays?",
            "model_answer": "On the whole, yes, though it varies a great deal by generation.",
            "band_target": 7.5,
        },
    ],
}


@pytest.fixture
def bank(db):
    import_speaking_bank(db, parse_document(BANK))
    return db.scalars(select(SpeakingQuestion)).all()


# ---------------------------------------------------------------------------- auth


def test_questions_require_authentication(client, bank):
    assert client.get("/api/speaking/questions").status_code == 401
    assert client.get("/api/speaking/questions/random").status_code == 401
    assert client.get("/api/speaking/topics").status_code == 401


# --------------------------------------------------------------------------- list


def test_list_returns_a_page_of_questions(client, auth_headers, bank):
    r = client.get("/api/speaking/questions", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 4
    assert len(body["items"]) == 4
    assert body["page"] == 1

    part1 = next(i for i in body["items"] if i["part"] == "part_1")
    assert part1["topic"]
    assert part1["model_answer"]
    assert part1["cue_points"] is None


def test_part_2_items_carry_the_cue_card(client, auth_headers, bank):
    r = client.get("/api/speaking/questions", headers=auth_headers, params={"part": "part_2"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["part"] == SpeakingPart.PART_2
    assert len(item["cue_points"]) == 4
    assert item["band_target"] == 7.5


def test_filter_by_part_and_topic(client, auth_headers, bank):
    r = client.get("/api/speaking/questions", headers=auth_headers, params={"part": "part_1"})
    assert r.json()["total"] == 2

    r = client.get("/api/speaking/questions", headers=auth_headers, params={"topic": "Hometown"})
    assert r.json()["total"] == 1

    r = client.get(
        "/api/speaking/questions",
        headers=auth_headers,
        params={"part": "part_3", "topic": "Hometown"},
    )
    assert r.json()["total"] == 0
    assert r.json()["items"] == []


def test_pagination(client, auth_headers, bank):
    first = client.get(
        "/api/speaking/questions", headers=auth_headers, params={"page": 1, "page_size": 3}
    ).json()
    second = client.get(
        "/api/speaking/questions", headers=auth_headers, params={"page": 2, "page_size": 3}
    ).json()
    assert len(first["items"]) == 3
    assert len(second["items"]) == 1
    assert second["total"] == 4
    assert second["page"] == 2
    ids = {i["id"] for i in first["items"]} | {i["id"] for i in second["items"]}
    assert len(ids) == 4


def test_invalid_part_is_a_422(client, auth_headers, bank):
    r = client.get("/api/speaking/questions", headers=auth_headers, params={"part": "part_9"})
    assert r.status_code == 422


# ------------------------------------------------------------------------- random


def test_random_returns_one_question_of_the_requested_part(client, auth_headers, bank):
    for _ in range(5):
        r = client.get(
            "/api/speaking/questions/random", headers=auth_headers, params={"part": "part_1"}
        )
        assert r.status_code == 200
        assert r.json()["part"] == "part_1"


def test_random_is_404_when_nothing_matches(client, auth_headers, bank):
    r = client.get(
        "/api/speaking/questions/random", headers=auth_headers, params={"topic": "Nothing"}
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Speaking question not found"


# ------------------------------------------------------------------------- topics


def test_topics_are_distinct_and_sorted(client, auth_headers, bank):
    r = client.get("/api/speaking/topics", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == ["A useful object", "Food and cooking", "Hometown"]


def test_topics_can_be_filtered_by_part(client, auth_headers, bank):
    r = client.get("/api/speaking/topics", headers=auth_headers, params={"part": "part_1"})
    assert r.json() == ["Food and cooking", "Hometown"]


def test_topics_is_empty_when_the_bank_is_empty(client, auth_headers):
    assert client.get("/api/speaking/topics", headers=auth_headers).json() == []
