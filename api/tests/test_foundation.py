"""Smoke tests for the shared foundation: fixtures, app wiring, auth dependencies."""

from app.core.security import create_token, hash_password, verify_password


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_openapi_builds(client):
    assert client.get("/openapi.json").status_code == 200


def test_password_round_trip():
    h = hash_password("password123")
    assert h != "password123"
    assert verify_password("password123", h)
    assert not verify_password("wrong", h)


def test_access_token_is_not_accepted_as_refresh(user):
    from app.core.security import decode_token

    token = create_token(user.id, "access")
    assert decode_token(token, "access")["sub"] == str(user.id)
    assert decode_token(token, "refresh") is None
    assert decode_token("garbage", "access") is None


def test_reading_fixture_is_wired(reading_test, db):
    assert len(reading_test.sections) == 1
    section = reading_test.sections[0]
    assert len(section.questions) == 4
    assert len(section.groups) == 1
    for q in section.questions:
        assert q.answer_key is not None, f"question {q.number} has no answer key"


def test_attempt_fixture(attempt, user, reading_test):
    assert attempt.user_id == user.id
    assert attempt.test_id == reading_test.id
    assert attempt.expires_at > attempt.started_at
