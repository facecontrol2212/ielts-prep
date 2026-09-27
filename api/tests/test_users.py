"""/users/me, the dashboard stats and the attempt history."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from freezegun import freeze_time

from app.core.security import create_token, hash_password
from app.models.attempt import Attempt
from app.models.enums import AttemptStatus, Skill, Variant
from app.models.test import Test as ExamTest
from app.models.user import User

ME = "/api/users/me"
STATS = "/api/users/me/stats"
ATTEMPTS = "/api/users/me/attempts"


# ---------------------------------------------------------------- factories


def make_test(db, skill=Skill.READING, title=None) -> ExamTest:
    t = ExamTest(
        slug=f"{skill}-{uuid.uuid4().hex[:8]}",
        skill=skill,
        variant=Variant.ACADEMIC,
        title=title or f"{skill.title()} Test",
        duration_seconds=3600,
        question_count=40,
        is_published=True,
    )
    db.add(t)
    db.commit()
    return t


def make_attempt(
    db,
    owner,
    test,
    *,
    status=AttemptStatus.SCORED,
    band=None,
    raw_score=None,
    when=None,
    breakdown=None,
) -> Attempt:
    when = when or datetime.now(UTC)
    scored = status == AttemptStatus.SCORED
    a = Attempt(
        user_id=owner.id,
        test_id=test.id,
        status=status,
        started_at=when,
        expires_at=when + timedelta(hours=1),
        submitted_at=when if scored else None,
        scored_at=when if scored else None,
        band=band,
        raw_score=raw_score,
        breakdown=breakdown,
    )
    db.add(a)
    db.commit()
    return a


@pytest.fixture
def other_user(db) -> User:
    u = User(
        email=f"other-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("password123"),
        full_name="Someone Else",
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def other_headers(other_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(other_user.id, 'access')}"}


# ---------------------------------------------------------------- GET /users/me


def test_get_me(client, auth_headers, user):
    r = client.get(ME, headers=auth_headers)
    assert r.status_code == 200

    body = r.json()
    assert body["id"] == str(user.id)
    assert body["email"] == user.email
    assert body["full_name"] == "Test Student"
    assert body["is_admin"] is False


def test_get_me_never_exposes_the_password_hash(client, auth_headers):
    body = client.get(ME, headers=auth_headers).json()
    assert "password_hash" not in body
    assert "password" not in body


def test_get_me_requires_auth(client):
    assert client.get(ME).status_code == 401


def test_two_users_each_see_only_themselves(client, auth_headers, other_headers, user, other_user):
    assert client.get(ME, headers=auth_headers).json()["email"] == user.email
    assert client.get(ME, headers=other_headers).json()["email"] == other_user.email


# ---------------------------------------------------------------- PATCH /users/me


def test_patch_me_updates_one_field_and_leaves_the_rest(client, auth_headers, db, user):
    user.locale = "en"
    user.target_band = 7.0
    db.commit()

    r = client.patch(ME, headers=auth_headers, json={"full_name": "Renamed"})
    assert r.status_code == 200

    body = r.json()
    assert body["full_name"] == "Renamed"
    assert body["locale"] == "en", "an unset field must not be reset to its default"
    assert body["target_band"] == 7.0


def test_patch_me_with_an_empty_body_changes_nothing(client, auth_headers, user):
    before = client.get(ME, headers=auth_headers).json()
    r = client.patch(ME, headers=auth_headers, json={})
    assert r.status_code == 200
    assert r.json() == before


def test_patch_me_can_set_every_field(client, auth_headers, db, user):
    r = client.patch(
        ME,
        headers=auth_headers,
        json={
            "full_name": "Full Name",
            "locale": "ru",
            "target_band": 8.0,
            "exam_date": "2026-12-01",
        },
    )
    assert r.status_code == 200
    assert r.json() == {
        **r.json(),
        "full_name": "Full Name",
        "locale": "ru",
        "target_band": 8.0,
        "exam_date": "2026-12-01",
    }

    db.refresh(user)
    assert user.target_band == 8.0
    assert user.exam_date.isoformat() == "2026-12-01"


def test_patch_me_can_clear_a_field_explicitly(client, auth_headers, db, user):
    client.patch(ME, headers=auth_headers, json={"target_band": 6.5})
    r = client.patch(ME, headers=auth_headers, json={"target_band": None})
    assert r.status_code == 200
    assert r.json()["target_band"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"target_band": 12},
        {"target_band": -1},
        {"locale": "fr"},
        {"full_name": "x" * 200},
    ],
)
def test_patch_me_validates(client, auth_headers, payload):
    assert client.patch(ME, headers=auth_headers, json=payload).status_code == 422


def test_patch_me_cannot_escalate_to_admin(client, auth_headers, db, user):
    r = client.patch(ME, headers=auth_headers, json={"is_admin": True, "is_verified": True})
    assert r.status_code == 200
    assert r.json()["is_admin"] is False

    db.refresh(user)
    assert user.is_admin is False, "UserUpdate has no privilege fields; extras must be ignored"


def test_patch_me_cannot_change_the_email(client, auth_headers, db, user):
    original = user.email
    client.patch(ME, headers=auth_headers, json={"email": "hijack@example.com"})
    db.refresh(user)
    assert user.email == original


def test_patch_me_requires_auth(client):
    assert client.patch(ME, json={"full_name": "x"}).status_code == 401


# ---------------------------------------------------------------- stats


def test_stats_are_zero_for_a_fresh_user(client, auth_headers):
    r = client.get(STATS, headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {
        "attempts_total": 0,
        "tests_completed": 0,
        "current_streak_days": 0,
        "best_band": {},
        "latest_band": {},
        "band_history": [],
        "weakest_types": [],
    }


def test_stats_requires_auth(client):
    assert client.get(STATS).status_code == 401


def test_stats_counts_and_bands(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING)
    listening = make_test(db, Skill.LISTENING)
    base = datetime.now(UTC) - timedelta(days=10)

    make_attempt(db, user, reading, band=6.0, raw_score=25, when=base)
    make_attempt(db, user, reading, band=7.5, raw_score=32, when=base + timedelta(days=2))
    make_attempt(db, user, reading, band=6.5, raw_score=28, when=base + timedelta(days=4))
    make_attempt(db, user, listening, band=8.0, raw_score=36, when=base + timedelta(days=3))
    make_attempt(db, user, reading, status=AttemptStatus.IN_PROGRESS, when=base + timedelta(days=5))
    make_attempt(db, user, reading, status=AttemptStatus.ABANDONED, when=base + timedelta(days=5))

    body = client.get(STATS, headers=auth_headers).json()

    assert body["attempts_total"] == 6, "every attempt counts, whatever its status"
    assert body["tests_completed"] == 4, "only scored attempts are completed tests"
    assert body["best_band"] == {"reading": 7.5, "listening": 8.0}
    assert body["latest_band"] == {"reading": 6.5, "listening": 8.0}

    history = body["band_history"]
    assert len(history) == 4
    assert [h["date"] for h in history] == sorted(h["date"] for h in history), "oldest first"
    assert history[0]["skill"] == "reading" and history[0]["band"] == 6.0
    assert history[-1]["band"] == 6.5


def test_stats_ignores_scored_attempts_without_a_band(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING)
    make_attempt(db, user, reading, band=None)

    body = client.get(STATS, headers=auth_headers).json()
    assert body["tests_completed"] == 1
    assert body["best_band"] == {}
    assert body["band_history"] == []


def test_stats_never_includes_another_users_attempts(client, auth_headers, db, user, other_user):
    reading = make_test(db, Skill.READING)
    make_attempt(db, other_user, reading, band=9.0)
    make_attempt(db, user, reading, band=5.0)

    body = client.get(STATS, headers=auth_headers).json()
    assert body["attempts_total"] == 1
    assert body["best_band"] == {"reading": 5.0}


def test_stats_weakest_types_from_the_breakdown(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING)
    make_attempt(
        db,
        user,
        reading,
        band=6.0,
        breakdown={
            "by_type": [
                {"type": "matching_headings", "correct": 1, "total": 5},
                {"type": "true_false_not_given", "correct": 4, "total": 5},
                {"type": "short_answer", "correct": 5, "total": 5},
            ]
        },
    )
    make_attempt(
        db,
        user,
        reading,
        band=6.5,
        breakdown={
            "by_type": [
                {"type": "matching_headings", "correct": 2, "total": 5},
                {"type": "true_false_not_given", "correct": 1, "total": 5},
            ]
        },
    )

    weakest = client.get(STATS, headers=auth_headers).json()["weakest_types"]
    assert [w["type"] for w in weakest] == [
        "matching_headings",
        "true_false_not_given",
        "short_answer",
    ]
    assert weakest[0] == {"type": "matching_headings", "correct": 3, "total": 10}
    assert weakest[1] == {"type": "true_false_not_given", "correct": 5, "total": 10}


@pytest.mark.parametrize(
    "breakdown",
    [
        None,
        {},
        {"by_type": None},
        {"by_type": []},
        {"by_type": "nonsense"},
        {"by_type": [{"no_type_key": 1}]},
        {"by_type": [{"type": "x", "correct": "many", "total": "lots"}]},
        {"by_type": [{"type": "x", "correct": 1, "total": 0}]},
        {"by_type": {"matching_headings": {"correct": 1, "total": 4}}},
        [{"type": "short_answer", "correct": 0, "total": 3}],
        "not-even-json-object",
        42,
    ],
)
def test_stats_survives_any_breakdown_shape(client, auth_headers, db, user, breakdown):
    """The breakdown JSON is written by another module; a surprise must not 500."""
    reading = make_test(db, Skill.READING)
    make_attempt(db, user, reading, band=6.0, breakdown=breakdown)
    assert client.get(STATS, headers=auth_headers).status_code == 200


def test_stats_reads_a_dict_shaped_breakdown(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING)
    make_attempt(
        db,
        user,
        reading,
        band=6.0,
        breakdown={"by_type": {"matching_headings": {"correct": 1, "total": 4}}},
    )
    weakest = client.get(STATS, headers=auth_headers).json()["weakest_types"]
    assert weakest == [{"type": "matching_headings", "correct": 1, "total": 4}]


# ---------------------------------------------------------------- streaks


@freeze_time("2026-05-20 09:00:00")
def test_streak_counts_back_from_today(client, db, user):
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    reading = make_test(db, Skill.READING)
    for day in ("2026-05-20", "2026-05-19", "2026-05-18", "2026-05-15"):
        make_attempt(
            db, user, reading, band=6.0, when=datetime.fromisoformat(f"{day}T08:00:00+00:00")
        )

    body = client.get(STATS, headers=headers).json()
    assert body["current_streak_days"] == 3, "20th, 19th, 18th; the 15th breaks the chain"


@freeze_time("2026-05-20 09:00:00")
def test_streak_may_end_yesterday(client, db, user):
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    reading = make_test(db, Skill.READING)
    for day in ("2026-05-19", "2026-05-18"):
        make_attempt(
            db, user, reading, band=6.0, when=datetime.fromisoformat(f"{day}T20:00:00+00:00")
        )

    body = client.get(STATS, headers=headers).json()
    assert body["current_streak_days"] == 2, "today is still young; yesterday keeps it alive"


@freeze_time("2026-05-20 09:00:00")
def test_streak_is_zero_once_two_days_are_missed(client, db, user):
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    reading = make_test(db, Skill.READING)
    for day in ("2026-05-18", "2026-05-17", "2026-05-16"):
        make_attempt(
            db, user, reading, band=6.0, when=datetime.fromisoformat(f"{day}T08:00:00+00:00")
        )

    assert client.get(STATS, headers=headers).json()["current_streak_days"] == 0


@freeze_time("2026-05-20 09:00:00")
def test_streak_counts_a_day_once_however_many_attempts(client, db, user):
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    reading = make_test(db, Skill.READING)
    for hour in (7, 12, 19):
        make_attempt(
            db,
            user,
            reading,
            band=6.0,
            when=datetime.fromisoformat(f"2026-05-20T{hour:02d}:00:00+00:00"),
        )

    assert client.get(STATS, headers=headers).json()["current_streak_days"] == 1


@freeze_time("2026-05-20 09:00:00")
def test_streak_ignores_unscored_attempts(client, db, user):
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    reading = make_test(db, Skill.READING)
    make_attempt(
        db,
        user,
        reading,
        status=AttemptStatus.IN_PROGRESS,
        when=datetime.fromisoformat("2026-05-20T08:00:00+00:00"),
    )
    body = client.get(STATS, headers=headers).json()
    assert body["current_streak_days"] == 0
    assert body["attempts_total"] == 1


# ---------------------------------------------------------------- attempt history


def test_attempts_empty_for_a_fresh_user(client, auth_headers):
    r = client.get(ATTEMPTS, headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_attempts_requires_auth(client):
    assert client.get(ATTEMPTS).status_code == 401


def test_attempts_are_newest_first_and_carry_test_metadata(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING, title="Reading Three")
    base = datetime.now(UTC) - timedelta(days=5)
    make_attempt(db, user, reading, band=6.0, raw_score=24, when=base)
    newest = make_attempt(db, user, reading, band=7.0, raw_score=31, when=base + timedelta(days=3))

    body = client.get(ATTEMPTS, headers=auth_headers).json()
    assert body["total"] == 2
    assert body["items"][0]["id"] == str(newest.id)
    assert body["items"][0]["test_title"] == "Reading Three"
    assert body["items"][0]["skill"] == "reading"
    assert body["items"][0]["band"] == 7.0
    assert body["items"][0]["raw_score"] == 31
    assert body["items"][0]["status"] == "scored"


def test_attempts_filter_by_skill(client, auth_headers, db, user):
    make_attempt(db, user, make_test(db, Skill.READING), band=6.0)
    make_attempt(db, user, make_test(db, Skill.LISTENING), band=7.0)
    make_attempt(db, user, make_test(db, Skill.LISTENING), band=7.5)

    body = client.get(ATTEMPTS, headers=auth_headers, params={"skill": "listening"}).json()
    assert body["total"] == 2
    assert {i["skill"] for i in body["items"]} == {"listening"}


def test_attempts_rejects_an_unknown_skill(client, auth_headers):
    assert (
        client.get(ATTEMPTS, headers=auth_headers, params={"skill": "juggling"}).status_code == 422
    )


def test_attempts_paginate(client, auth_headers, db, user):
    reading = make_test(db, Skill.READING)
    base = datetime.now(UTC) - timedelta(days=10)
    for i in range(5):
        make_attempt(db, user, reading, band=5.0 + i, when=base + timedelta(days=i))

    first = client.get(ATTEMPTS, headers=auth_headers, params={"page": 1, "page_size": 2}).json()
    second = client.get(ATTEMPTS, headers=auth_headers, params={"page": 2, "page_size": 2}).json()
    third = client.get(ATTEMPTS, headers=auth_headers, params={"page": 3, "page_size": 2}).json()

    assert first["total"] == second["total"] == 5
    assert [len(p["items"]) for p in (first, second, third)] == [2, 2, 1]
    assert first["items"][0]["band"] == 9.0, "newest first across pages"

    seen = [i["id"] for p in (first, second, third) for i in p["items"]]
    assert len(set(seen)) == 5, "no attempt appears on two pages"


def test_attempts_page_past_the_end_is_empty(client, auth_headers, db, user):
    make_attempt(db, user, make_test(db, Skill.READING), band=6.0)
    body = client.get(ATTEMPTS, headers=auth_headers, params={"page": 9}).json()
    assert body["items"] == []
    assert body["total"] == 1


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page": -1}, {"page_size": 0}, {"page_size": 500}]
)
def test_attempts_validates_pagination(client, auth_headers, params):
    assert client.get(ATTEMPTS, headers=auth_headers, params=params).status_code == 422


def test_attempts_never_leak_between_users(
    client, auth_headers, other_headers, db, user, other_user
):
    reading = make_test(db, Skill.READING)
    mine = make_attempt(db, user, reading, band=6.0)
    theirs = make_attempt(db, other_user, reading, band=9.0)

    mine_body = client.get(ATTEMPTS, headers=auth_headers).json()
    assert [i["id"] for i in mine_body["items"]] == [str(mine.id)]

    their_body = client.get(ATTEMPTS, headers=other_headers).json()
    assert [i["id"] for i in their_body["items"]] == [str(theirs.id)]
