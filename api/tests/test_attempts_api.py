"""The attempt lifecycle: start, resume, autosave, expiry, submit, result, abandon.

Agent A owns ``app.services.scoring``. These tests patch ``score_attempt`` at the
place ``attempt_service`` looks it up, so the lifecycle is verified independently of
the engine's progress; ``test_real_scoring_engine_end_to_end`` is the one test that
calls the real thing and xfails politely while it is still a stub.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.security import create_token, hash_password
from app.models.attempt import Attempt, AttemptAnswer
from app.models.enums import AttemptStatus, QuestionType, Skill, Variant
from app.models.test import AnswerKey, Question, Section
from app.models.test import Test as ExamTest
from app.models.user import User
from app.schemas.attempt import AttemptResult
from app.schemas.test import QuestionReview
from app.services import attempt_service

ATTEMPTS = "/api/attempts"


def bearer(u: User) -> dict[str, str]:
    """A freshly minted token. Re-mint inside freeze_time: JWTs expire too."""
    return {"Authorization": f"Bearer {create_token(u.id, 'access')}"}


# ------------------------------------------------------------------ test doubles


def fake_score_attempt(db, attempt: Attempt) -> AttemptResult:
    """Stand-in for Agent A's engine: marks answers by naive case-folded equality."""
    test = db.get(ExamTest, attempt.test_id)
    questions = (
        db.execute(
            select(Question)
            .join(Section, Section.id == Question.section_id)
            .where(Section.test_id == test.id)
            .order_by(Question.number)
        )
        .scalars()
        .all()
    )
    saved = {row.question_id: row for row in attempt.answers}
    now = datetime.now(UTC)
    raw = 0
    review: list[QuestionReview] = []

    for q in questions:
        row = saved.get(q.id)
        given = row.value if row is not None else None
        accepted = list(q.answer_key.accepted) if q.answer_key is not None else []
        is_correct = isinstance(given, str) and given.strip().casefold() in {
            a.casefold() for a in accepted
        }
        raw += int(is_correct)
        if row is not None:
            row.is_correct = is_correct
            row.reason = None if is_correct else ("blank" if given in (None, "") else "wrong")
            row.checked_at = now
        review.append(
            QuestionReview(
                question_id=q.id,
                number=q.number,
                type=q.type,
                prompt=q.prompt,
                your_answer=given,
                correct_answers=accepted,
                is_correct=is_correct,
                reason=None if is_correct else "wrong",
                explanation=None,
                evidence=q.evidence,
                audio_timestamp=q.audio_timestamp,
            )
        )

    attempt.raw_score = raw
    attempt.band = float(raw)
    attempt.status = AttemptStatus.SCORED
    attempt.scored_at = now
    db.flush()

    return AttemptResult(
        attempt_id=attempt.id,
        skill=test.skill,
        test_title=test.title,
        status=AttemptStatus.SCORED,
        raw_score=raw,
        total_questions=len(questions),
        band=float(raw),
        submitted_at=attempt.submitted_at,
        duration_seconds=None,
        sections=[],
        by_type=[],
        review=review,
    )


def lazy_score_attempt(db, attempt: Attempt) -> AttemptResult:
    """A minimal engine that persists nothing, to prove the service fills the gaps."""
    return AttemptResult(
        attempt_id=attempt.id,
        skill=Skill.READING,
        test_title="whatever",
        status=AttemptStatus.SUBMITTED,
        raw_score=7,
        total_questions=4,
        band=5.5,
        submitted_at=attempt.submitted_at,
        duration_seconds=None,
        sections=[],
        by_type=[],
        review=[],
    )


@pytest.fixture
def scoring(monkeypatch) -> list[uuid.UUID]:
    """Patch the engine where attempt_service resolves it; collect the calls."""
    calls: list[uuid.UUID] = []

    def spy(db, attempt):
        calls.append(attempt.id)
        return fake_score_attempt(db, attempt)

    monkeypatch.setattr("app.services.scoring.score_attempt", spy)
    return calls


# ------------------------------------------------------------------ data helpers


@pytest.fixture
def other_user(db) -> User:
    u = User(
        email=f"other-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("password123"),
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def other_test(db) -> ExamTest:
    """A second published test, used to prove cross-test answers are rejected."""
    t = ExamTest(
        slug="listening-other-1",
        skill=Skill.LISTENING,
        variant=Variant.ACADEMIC,
        title="Other Test",
        duration_seconds=1800,
        transfer_seconds=120,
        question_count=1,
        is_published=True,
    )
    section = Section(order=1, title="Section 1", start_question=1, end_question=1)
    section.questions.append(
        Question(number=1, type=QuestionType.SHORT_ANSWER, prompt="Unrelated question")
    )
    t.sections.append(section)
    db.add(t)
    db.flush()
    db.add(AnswerKey(question_id=section.questions[0].id, accepted=["x"]))
    db.commit()
    return t


@pytest.fixture
def unpublished_test(db) -> ExamTest:
    t = ExamTest(
        slug="reading-secret-1",
        skill=Skill.READING,
        title="Not Live Yet",
        question_count=1,
        is_published=False,
    )
    db.add(t)
    db.commit()
    return t


def start(client, headers, test) -> dict[str, Any]:
    r = client.post(ATTEMPTS, json={"test_slug": test.slug}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def question_ids(session_payload: dict[str, Any]) -> list[str]:
    return [
        q["id"]
        for section in session_payload["test"]["sections"]
        for group in section["groups"]
        for q in group["questions"]
    ]


# ------------------------------------------------------------------ auth


def test_every_endpoint_needs_a_token(client, attempt):
    aid = attempt.id
    unauthenticated = [
        client.post(ATTEMPTS, json={"test_id": str(attempt.test_id)}),
        client.get(f"{ATTEMPTS}/{aid}"),
        client.patch(f"{ATTEMPTS}/{aid}/answers", json={"answers": []}),
        client.post(f"{ATTEMPTS}/{aid}/submit"),
        client.get(f"{ATTEMPTS}/{aid}/result"),
        client.delete(f"{ATTEMPTS}/{aid}"),
    ]
    assert [r.status_code for r in unauthenticated] == [401] * 6


# ------------------------------------------------------------------ start


def test_start_returns_the_session_and_sets_the_deadline(
    client, db, user, auth_headers, reading_test
):
    body = start(client, auth_headers, reading_test)

    assert body["attempt"]["status"] == "in_progress"
    assert body["attempt"]["test_id"] == str(reading_test.id)
    assert body["answers"] == []
    assert 3590 <= body["attempt"]["seconds_remaining"] <= 3600

    row = db.get(Attempt, uuid.UUID(body["attempt"]["id"]))
    expected = row.started_at + timedelta(
        seconds=reading_test.duration_seconds + reading_test.transfer_seconds
    )
    assert row.expires_at == expected


def test_start_includes_transfer_time_in_the_deadline(client, db, user, auth_headers, other_test):
    body = start(client, auth_headers, other_test)
    # 1800s listening + 120s transfer
    assert 1910 <= body["attempt"]["seconds_remaining"] <= 1920


def test_start_accepts_a_test_id(client, auth_headers, reading_test):
    r = client.post(ATTEMPTS, json={"test_id": str(reading_test.id)}, headers=auth_headers)
    assert r.status_code == 201


def test_start_without_a_test_reference_is_400(client, auth_headers):
    assert client.post(ATTEMPTS, json={}, headers=auth_headers).status_code == 400


def test_start_on_an_unknown_test_is_404(client, auth_headers):
    r = client.post(ATTEMPTS, json={"test_slug": "does-not-exist"}, headers=auth_headers)
    assert r.status_code == 404


def test_start_on_an_unpublished_test_is_404(client, auth_headers, unpublished_test):
    r = client.post(ATTEMPTS, json={"test_slug": unpublished_test.slug}, headers=auth_headers)
    assert r.status_code == 404


def test_second_start_conflicts_and_names_the_live_attempt(client, auth_headers, reading_test):
    first = start(client, auth_headers, reading_test)
    r = client.post(ATTEMPTS, json={"test_slug": reading_test.slug}, headers=auth_headers)
    assert r.status_code == 409
    assert first["attempt"]["id"] in r.json()["detail"]


def test_a_second_start_is_allowed_once_the_first_is_finished(
    client, auth_headers, reading_test, scoring
):
    first = start(client, auth_headers, reading_test)
    assert (
        client.post(f"{ATTEMPTS}/{first['attempt']['id']}/submit", headers=auth_headers).status_code
        == 200
    )
    second = start(client, auth_headers, reading_test)
    assert second["attempt"]["id"] != first["attempt"]["id"]


def test_another_user_may_sit_the_same_test_concurrently(
    client, auth_headers, other_user, reading_test
):
    start(client, auth_headers, reading_test)
    r = client.post(ATTEMPTS, json={"test_slug": reading_test.slug}, headers=bearer(other_user))
    assert r.status_code == 201


# ------------------------------------------------------------------ the answer-key blackout


def test_session_payload_never_contains_the_answer_key(
    client, db, user, auth_headers, reading_test
):
    """The one rule that matters (plan.md §4): the client never sees the key."""
    key = db.execute(
        select(AnswerKey)
        .join(Question, Question.id == AnswerKey.question_id)
        .join(Section, Section.id == Question.section_id)
        .where(Section.test_id == reading_test.id, Question.number == 1)
    ).scalar_one()
    # A sentinel that exists nowhere in the passage or the prompts, so the assertion
    # cannot pass by luck.
    key.accepted = [*key.accepted, "ZZZ-SENTINEL-ANSWER"]
    key.explanation = "ZZZ-SENTINEL-EXPLANATION"
    db.commit()

    raw = client.post(ATTEMPTS, json={"test_slug": reading_test.slug}, headers=auth_headers).text

    assert "ZZZ-SENTINEL" not in raw
    for field in (
        "accepted",
        "answer_key",
        "answerKey",
        "match_mode",
        "allow_optional_article",
        "explanation",
        "is_correct",
        "correct_answers",
        "evidence",
        "transcript",
    ):
        assert field not in raw, f"session payload leaked the {field!r} field"

    # The fixture's real answers ("TRUE", "colour", "largest coral reef system") also
    # occur legitimately in the passage, the option labels and a prompt, so strip the
    # content fields the student is entitled to see and re-check what is left.
    content_fields = {
        "prompt",
        "prompt_html",
        "passage_html",
        "instructions",
        "content_html",
        "options",
        "title",
        "description",
    }

    def strip(node):
        if isinstance(node, dict):
            return {k: strip(v) for k, v in node.items() if k not in content_fields}
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    stripped = json.dumps(strip(json.loads(raw)))
    for answer in ("largest coral reef system", "TRUE", "colour"):
        assert answer not in stripped, f"answer {answer!r} leaked outside the question content"


def test_question_objects_expose_only_the_contracted_fields(client, auth_headers, reading_test):
    body = start(client, auth_headers, reading_test)
    allowed = {"id", "number", "type", "prompt", "options", "word_limit", "allow_number"}
    seen = 0
    for section in body["test"]["sections"]:
        for group in section["groups"]:
            for q in group["questions"]:
                assert set(q) == allowed, f"unexpected question fields: {set(q) - allowed}"
                seen += 1
    assert seen == 4, "the runner still needs the actual questions"


# ------------------------------------------------------------------ resume + autosave


def test_full_lifecycle(client, db, user, auth_headers, reading_test, scoring):
    session = start(client, auth_headers, reading_test)
    aid = session["attempt"]["id"]
    qids = question_ids(session)

    # resume
    resumed = client.get(f"{ATTEMPTS}/{aid}", headers=auth_headers)
    assert resumed.status_code == 200
    assert resumed.json()["attempt"]["id"] == aid
    assert resumed.json()["answers"] == []

    # save
    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={
            "answers": [
                {"question_id": qids[0], "value": "largest coral reef system"},
                {"question_id": qids[1], "value": "FALSE", "is_flagged": True},
            ]
        },
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["saved"] == 2
    assert r.json()["seconds_remaining"] > 0

    # save again: idempotent upsert, not a second row
    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={"answers": [{"question_id": qids[1], "value": "TRUE"}]},
        headers=auth_headers,
    )
    assert r.status_code == 200 and r.json()["saved"] == 1

    rows = (
        db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == uuid.UUID(aid)))
        .scalars()
        .all()
    )
    assert len(rows) == 2, "upsert must key on (attempt_id, question_id)"
    assert {r.question_id: r.value for r in rows}[uuid.UUID(qids[1])] == "TRUE"

    # resume replays them
    replayed = client.get(f"{ATTEMPTS}/{aid}", headers=auth_headers).json()["answers"]
    assert len(replayed) == 2
    assert replayed[0]["question_id"] == qids[0]
    assert replayed[1]["is_flagged"] is False  # overwritten by the second save

    # submit
    result = client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["status"] == "scored"
    assert body["raw_score"] == 2  # q1 and q2 correct
    assert body["total_questions"] == 4
    assert len(body["review"]) == 4

    # result
    again = client.get(f"{ATTEMPTS}/{aid}/result", headers=auth_headers)
    assert again.status_code == 200
    assert again.json()["raw_score"] == 2

    row = db.get(Attempt, uuid.UUID(aid))
    assert row.status == AttemptStatus.SCORED
    assert row.submitted_at is not None and row.scored_at is not None
    assert row.auto_submitted is False


def test_saving_an_empty_batch_is_a_no_op(client, auth_headers, reading_test):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    r = client.patch(f"{ATTEMPTS}/{aid}/answers", json={"answers": []}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["saved"] == 0


def test_a_repeated_batch_within_one_request_keeps_the_last_value(
    client, db, auth_headers, reading_test
):
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)
    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={
            "answers": [
                {"question_id": qids[0], "value": "first"},
                {"question_id": qids[0], "value": "second"},
            ]
        },
        headers=auth_headers,
    )
    assert r.status_code == 200 and r.json()["saved"] == 1
    rows = (
        db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == uuid.UUID(aid)))
        .scalars()
        .all()
    )
    assert len(rows) == 1 and rows[0].value == "second"


def test_saving_a_question_from_another_test_is_400(
    client, db, auth_headers, reading_test, other_test
):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    foreign = other_test.sections[0].questions[0].id

    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={"answers": [{"question_id": str(foreign), "value": "x"}]},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert str(foreign) in r.json()["detail"]
    assert db.execute(select(AttemptAnswer)).scalars().all() == [], "nothing may be written"


def test_saving_an_unknown_question_id_is_400(client, auth_headers, reading_test):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={"answers": [{"question_id": str(uuid.uuid4()), "value": "x"}]},
        headers=auth_headers,
    )
    assert r.status_code == 400


# ------------------------------------------------------------------ submit / result guards


def test_result_before_submit_is_409(client, auth_headers, reading_test):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    r = client.get(f"{ATTEMPTS}/{aid}/result", headers=auth_headers)
    assert r.status_code == 409


def test_double_submit_is_409(client, auth_headers, reading_test, scoring):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    assert client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers).status_code == 200
    second = client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers)
    assert second.status_code == 409
    assert len(scoring) == 1, "a refused submit must not re-score"


def test_saving_after_submit_is_409(client, auth_headers, reading_test, scoring):
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)
    client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers)
    r = client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={"answers": [{"question_id": qids[0], "value": "too late"}]},
        headers=auth_headers,
    )
    assert r.status_code == 409


def test_the_service_finishes_the_job_when_the_engine_is_lazy(
    client, db, monkeypatch, auth_headers, reading_test
):
    """Whatever the engine persists, the attempt must end up scored."""
    monkeypatch.setattr("app.services.scoring.score_attempt", lazy_score_attempt)
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    body = client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers).json()

    assert body["status"] == "scored"
    row = db.get(Attempt, uuid.UUID(aid))
    assert row.status == AttemptStatus.SCORED
    assert row.raw_score == 7 and row.band == 5.5 and row.scored_at is not None


def test_unknown_attempt_is_404(client, auth_headers):
    assert client.get(f"{ATTEMPTS}/{uuid.uuid4()}", headers=auth_headers).status_code == 404


# ------------------------------------------------------------------ ownership


def test_user_b_cannot_touch_user_as_attempt(client, auth_headers, other_user, reading_test):
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)
    intruder = bearer(other_user)

    responses = {
        "read": client.get(f"{ATTEMPTS}/{aid}", headers=intruder),
        "save": client.patch(
            f"{ATTEMPTS}/{aid}/answers",
            json={"answers": [{"question_id": qids[0], "value": "x"}]},
            headers=intruder,
        ),
        "submit": client.post(f"{ATTEMPTS}/{aid}/submit", headers=intruder),
        "result": client.get(f"{ATTEMPTS}/{aid}/result", headers=intruder),
        "delete": client.delete(f"{ATTEMPTS}/{aid}", headers=intruder),
    }
    assert {name: r.status_code for name, r in responses.items()} == dict.fromkeys(responses, 403)


def test_a_rejected_intruder_changes_nothing(client, db, auth_headers, other_user, reading_test):
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)
    client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={"answers": [{"question_id": qids[0], "value": "x"}]},
        headers=bearer(other_user),
    )
    client.delete(f"{ATTEMPTS}/{aid}", headers=bearer(other_user))

    assert db.execute(select(AttemptAnswer)).scalars().all() == []
    assert db.get(Attempt, uuid.UUID(aid)).status == AttemptStatus.IN_PROGRESS


# ------------------------------------------------------------------ abandon


def test_abandon_marks_the_attempt_and_locks_it(client, db, auth_headers, reading_test, scoring):
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)

    r = client.delete(f"{ATTEMPTS}/{aid}", headers=auth_headers)
    assert r.status_code == 200
    assert db.get(Attempt, uuid.UUID(aid)).status == AttemptStatus.ABANDONED

    assert (
        client.patch(
            f"{ATTEMPTS}/{aid}/answers",
            json={"answers": [{"question_id": qids[0], "value": "x"}]},
            headers=auth_headers,
        ).status_code
        == 409
    )
    assert client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers).status_code == 409
    assert client.get(f"{ATTEMPTS}/{aid}/result", headers=auth_headers).status_code == 409
    assert scoring == [], "abandoning must never score"


def test_abandon_is_idempotent(client, auth_headers, reading_test):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    assert client.delete(f"{ATTEMPTS}/{aid}", headers=auth_headers).status_code == 200
    assert client.delete(f"{ATTEMPTS}/{aid}", headers=auth_headers).status_code == 200


def test_abandoning_a_scored_attempt_is_409(client, auth_headers, reading_test, scoring):
    aid = start(client, auth_headers, reading_test)["attempt"]["id"]
    client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers)
    assert client.delete(f"{ATTEMPTS}/{aid}", headers=auth_headers).status_code == 409


# ------------------------------------------------------------------ the clock


def test_expiry_auto_submits_on_read_and_locks_later_saves(client, db, user, reading_test, scoring):
    """The server owns the clock: closing the tab does not pause the exam."""
    t0 = datetime(2026, 1, 1, 9, 0, 0, tzinfo=UTC)
    with freeze_time(t0) as clock:
        session = start(client, bearer(user), reading_test)
        aid, qids = session["attempt"]["id"], question_ids(session)

        def save(value: str):
            return client.patch(
                f"{ATTEMPTS}/{aid}/answers",
                json={"answers": [{"question_id": qids[0], "value": value}]},
                headers=bearer(user),
            )

        assert save("in time").status_code == 200

        # 10s past the deadline: inside the clock-skew grace, still accepted.
        clock.move_to(t0 + timedelta(seconds=3610))
        assert save("just in time").status_code == 200
        assert (
            client.get(f"{ATTEMPTS}/{aid}", headers=bearer(user)).json()["attempt"][
                "seconds_remaining"
            ]
            == 0
        )

        # Well past it: the next read settles the attempt without being asked.
        clock.move_to(t0 + timedelta(seconds=3900))
        resumed = client.get(f"{ATTEMPTS}/{aid}", headers=bearer(user))
        assert resumed.status_code == 200
        assert resumed.json()["attempt"]["status"] == "scored"
        assert resumed.json()["attempt"]["seconds_remaining"] == 0

        row = db.get(Attempt, uuid.UUID(aid))
        assert row.auto_submitted is True
        assert row.submitted_at is not None
        assert len(scoring) == 1

        # and the exam is now closed
        assert save("far too late").status_code == 409
        assert client.post(f"{ATTEMPTS}/{aid}/submit", headers=bearer(user)).status_code == 409
        assert client.get(f"{ATTEMPTS}/{aid}/result", headers=bearer(user)).status_code == 200


def test_a_save_well_past_the_deadline_auto_submits_instead(
    client, db, user, reading_test, scoring
):
    t0 = datetime(2026, 1, 1, 9, 0, 0, tzinfo=UTC)
    with freeze_time(t0) as clock:
        session = start(client, bearer(user), reading_test)
        aid, qids = session["attempt"]["id"], question_ids(session)
        clock.move_to(t0 + timedelta(seconds=3700))
        r = client.patch(
            f"{ATTEMPTS}/{aid}/answers",
            json={"answers": [{"question_id": qids[0], "value": "nope"}]},
            headers=bearer(user),
        )
        assert r.status_code == 409
        assert db.get(Attempt, uuid.UUID(aid)).status == AttemptStatus.SCORED
        assert db.get(Attempt, uuid.UUID(aid)).auto_submitted is True


def test_an_expired_attempt_does_not_block_a_new_one(client, user, reading_test, scoring):
    t0 = datetime(2026, 1, 1, 9, 0, 0, tzinfo=UTC)
    with freeze_time(t0) as clock:
        first = start(client, bearer(user), reading_test)
        clock.move_to(t0 + timedelta(seconds=4000))
        second = start(client, bearer(user), reading_test)
        assert second["attempt"]["id"] != first["attempt"]["id"]
        assert second["attempt"]["status"] == "in_progress"


def test_seconds_remaining_never_goes_negative(reading_test):
    """A blown deadline reads as 0, never as a negative countdown."""
    t0 = datetime(2026, 1, 1, 9, 0, 0, tzinfo=UTC)
    row = Attempt(
        user_id=uuid.uuid4(),
        test_id=reading_test.id,
        started_at=t0,
        expires_at=t0 + timedelta(seconds=10),
    )
    with freeze_time(t0 + timedelta(seconds=5)):
        assert attempt_service.seconds_remaining(row) == 5
    with freeze_time(t0 + timedelta(days=3)):
        assert attempt_service.seconds_remaining(row) == 0


def test_naive_expires_at_is_treated_as_utc(reading_test):
    """Postgres hands back aware datetimes, SQLite does not. Both must work."""
    naive = datetime.now(UTC).replace(tzinfo=None) + timedelta(seconds=120)
    row = Attempt(
        user_id=uuid.uuid4(),
        test_id=reading_test.id,
        started_at=naive,
        expires_at=naive,
    )
    assert 110 <= attempt_service.seconds_remaining(row) <= 120


# ------------------------------------------------------------------ the real engine


def test_real_scoring_engine_end_to_end(client, db, user, auth_headers, reading_test):
    """No monkeypatch: the genuine app.services.scoring, once Agent A has landed."""
    session = start(client, auth_headers, reading_test)
    aid, qids = session["attempt"]["id"], question_ids(session)
    client.patch(
        f"{ATTEMPTS}/{aid}/answers",
        json={
            "answers": [
                # "largest coral reef system" is also accepted but breaks the
                # group's NO MORE THAN TWO WORDS limit, which IELTS marks wrong.
                {"question_id": qids[0], "value": "largest"},
                {"question_id": qids[1], "value": "TRUE"},
                {"question_id": qids[2], "value": "A"},
                {"question_id": qids[3], "value": "colour"},
            ]
        },
        headers=auth_headers,
    )
    try:
        r = client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers)
    except NotImplementedError:
        pytest.xfail("app.services.scoring.score_attempt is still a stub (Agent A)")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scored"
    assert body["total_questions"] == 4
    assert body["raw_score"] == 4, "every fixture answer above is the accepted one"
    assert db.get(Attempt, uuid.UUID(aid)).status == AttemptStatus.SCORED

    # /result rebuilds the payload through the same engine; it must be stable.
    again = client.get(f"{ATTEMPTS}/{aid}/result", headers=auth_headers)
    assert again.status_code == 200, again.text
    assert again.json()["raw_score"] == 4
    assert client.post(f"{ATTEMPTS}/{aid}/submit", headers=auth_headers).status_code == 409


# ------------------------------------------------------------------ ungrouped questions


def test_ungrouped_questions_are_still_delivered_to_the_runner(client, db, user, auth_headers):
    """A question with no group must never silently vanish from the exam.

    The runner renders sections -> groups -> questions. Nothing enforces that every
    question belongs to a group, so the payload synthesises one rather than dropping
    the question and marking the student wrong for never seeing it.
    """
    test = ExamTest(
        slug="orphan-questions",
        skill=Skill.READING,
        variant=Variant.ACADEMIC,
        title="Orphans",
        duration_seconds=600,
        question_count=3,
        is_published=True,
    )
    section = Section(order=1, title="Passage 1", instructions="Answer the questions.")
    test.sections.append(section)
    section.questions.extend(
        [
            Question(number=1, type=QuestionType.SHORT_ANSWER, prompt="One?"),
            Question(number=2, type=QuestionType.SHORT_ANSWER, prompt="Two?"),
            Question(number=3, type=QuestionType.TRUE_FALSE_NOT_GIVEN, prompt="Three?"),
        ]
    )
    db.add(test)
    db.flush()
    for q in section.questions:
        db.add(AnswerKey(question_id=q.id, accepted=["x"]))
    db.commit()
    assert all(q.group_id is None for q in section.questions)

    session = start(client, auth_headers, test)
    groups = session["test"]["sections"][0]["groups"]
    numbers = [q["number"] for g in groups for q in g["questions"]]

    assert numbers == [1, 2, 3], "every question must reach the runner"
    # Consecutive orphans of the same type share a group; a new type starts a new one.
    assert [g["type"] for g in groups] == ["short_answer", "true_false_not_given"]
    assert [len(g["questions"]) for g in groups] == [2, 1]
    assert [g["order"] for g in groups] == [1, 2]


def test_synthetic_group_ids_are_stable_across_resumes(client, db, user, auth_headers):
    """A resumed sitting must not reshuffle group ids under the runner's feet."""
    test = ExamTest(
        slug="orphan-stable",
        skill=Skill.READING,
        title="Orphans",
        duration_seconds=600,
        question_count=1,
        is_published=True,
    )
    section = Section(order=1, title="Passage 1")
    test.sections.append(section)
    section.questions.append(Question(number=1, type=QuestionType.SHORT_ANSWER, prompt="One?"))
    db.add(test)
    db.flush()
    db.add(AnswerKey(question_id=section.questions[0].id, accepted=["x"]))
    db.commit()

    first = start(client, auth_headers, test)
    resumed = client.get(f"{ATTEMPTS}/{first['attempt']['id']}", headers=auth_headers).json()

    assert (
        first["test"]["sections"][0]["groups"][0]["id"]
        == resumed["test"]["sections"][0]["groups"][0]["id"]
    )
