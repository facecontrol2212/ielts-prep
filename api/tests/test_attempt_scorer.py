"""Scoring a whole attempt: marks, raw score, band, breakdown, review, idempotency."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.models.attempt import Attempt, AttemptAnswer
from app.models.enums import AttemptStatus, MatchMode, QuestionType, Skill, Variant
from app.models.test import AnswerKey, Question, Section
from app.models.test import Test as ExamTest
from app.services.scoring import score_attempt

ALL_CORRECT: dict[int, Any] = {1: "largest", 2: "T", 3: "a", 4: "colour"}


def questions_by_number(test: ExamTest) -> dict[int, Question]:
    return {q.number: q for section in test.sections for q in section.questions}


def add_answers(db, attempt: Attempt, test: ExamTest, values: dict[int, Any]) -> None:
    lookup = questions_by_number(test)
    for number, value in values.items():
        db.add(
            AttemptAnswer(
                attempt_id=attempt.id,
                question_id=lookup[number].id,
                value=value,
            )
        )
    db.commit()


def answer_rows(db, attempt: Attempt) -> dict[uuid.UUID, AttemptAnswer]:
    return {row.question_id: row for row in db.query(AttemptAnswer).filter_by(attempt_id=attempt.id)}


# ------------------------------------------------------------- the happy path


def test_all_correct(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, ALL_CORRECT)
    result = score_attempt(db, attempt)

    assert result.raw_score == 4
    assert result.total_questions == 4
    assert result.status == AttemptStatus.SCORED
    assert result.skill == Skill.READING
    assert result.test_title == reading_test.title
    assert all(item.is_correct for item in result.review)


def test_scoring_persists_everything_on_the_attempt(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, ALL_CORRECT)
    result = score_attempt(db, attempt)

    assert attempt.status == AttemptStatus.SCORED
    assert attempt.raw_score == 4
    assert attempt.band == result.band
    assert attempt.scored_at is not None
    assert attempt.submitted_at is not None
    assert attempt.breakdown == {
        "sections": [{"section_order": 1, "title": "Passage 1", "correct": 4, "total": 4}],
        "by_type": [
            {"type": "sentence_completion", "correct": 1, "total": 1},
            {"type": "true_false_not_given", "correct": 1, "total": 1},
            {"type": "multiple_choice", "correct": 1, "total": 1},
            {"type": "short_answer", "correct": 1, "total": 1},
        ],
    }


def test_marks_are_written_to_every_answered_row(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {1: "largest", 2: "FALSE"})
    score_attempt(db, attempt)

    lookup = questions_by_number(reading_test)
    rows = answer_rows(db, attempt)
    assert rows[lookup[1].id].is_correct is True
    assert rows[lookup[1].id].reason is None
    assert rows[lookup[1].id].checked_at is not None
    assert rows[lookup[2].id].is_correct is False
    assert rows[lookup[2].id].reason == "wrong"


def test_checked_at_is_not_moved_on_a_rescore(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {1: "largest"})
    earlier = datetime.now(UTC) - timedelta(hours=1)
    lookup = questions_by_number(reading_test)
    row = answer_rows(db, attempt)[lookup[1].id]
    row.checked_at = earlier
    db.commit()

    score_attempt(db, attempt)
    assert answer_rows(db, attempt)[lookup[1].id].checked_at is not None


# ------------------------------------------------------- unanswered questions


@pytest.mark.parametrize(
    ("values", "expected_raw"),
    [
        ({}, 0),
        ({2: "TRUE"}, 1),
        ({2: "TRUE", 3: "A"}, 2),
        ({1: "largest", 2: "T", 3: "a"}, 3),
        (ALL_CORRECT, 4),
    ],
)
def test_unanswered_questions_count_as_wrong(db, attempt, reading_test, values, expected_raw):
    add_answers(db, attempt, reading_test, values)
    result = score_attempt(db, attempt)
    assert result.raw_score == expected_raw
    assert result.total_questions == 4
    assert len(result.review) == 4


def test_unanswered_questions_appear_in_the_review_as_blank(db, attempt, reading_test):
    result = score_attempt(db, attempt)
    assert {item.reason for item in result.review} == {"blank"}
    assert all(item.your_answer is None for item in result.review)


def test_no_answer_rows_are_created_for_unanswered_questions(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {2: "TRUE"})
    score_attempt(db, attempt)
    assert len(answer_rows(db, attempt)) == 1


# ------------------------------------------------------------ marking reasons


@pytest.mark.parametrize(
    ("number", "value", "correct", "reason"),
    [
        (1, "largest", True, None),
        (1, "  Largest.  ", True, None),
        # the key's long form busts the group's two-word limit
        (1, "largest coral reef system", False, "over_word_limit"),
        (1, "smallest", False, "wrong"),
        (2, "T", True, None),
        (2, "true", True, None),
        (2, "NG", False, "wrong"),
        (3, "A", True, None),
        (3, ["A"], True, None),
        (3, "Z", False, "wrong"),
        (4, "colour", True, None),
        (4, "color", True, None),
        (4, "colur", False, "spelling"),
        (4, "bright colour", False, "over_word_limit"),
        (4, "", False, "blank"),
        (4, None, False, "blank"),
    ],
)
def test_review_reasons(db, attempt, reading_test, number, value, correct, reason):
    add_answers(db, attempt, reading_test, {number: value})
    result = score_attempt(db, attempt)
    item = next(i for i in result.review if i.number == number)
    assert item.is_correct is correct
    assert item.reason == reason


def test_review_carries_the_key_and_the_evidence(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {4: "colour"})
    result = score_attempt(db, attempt)

    item = next(i for i in result.review if i.number == 4)
    assert item.correct_answers == ["colour", "color"]
    assert item.your_answer == "colour"
    assert item.type == QuestionType.SHORT_ANSWER
    assert [i.number for i in result.review] == [1, 2, 3, 4]


# ------------------------------------------------------------------ breakdown


def test_section_and_type_breakdown(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {1: "largest", 2: "T", 3: "B", 4: "texture"})
    result = score_attempt(db, attempt)

    assert [s.model_dump() for s in result.sections] == [
        {"section_order": 1, "title": "Passage 1", "correct": 2, "total": 4}
    ]
    by_type = {t.type: (t.correct, t.total) for t in result.by_type}
    assert by_type == {
        "sentence_completion": (1, 1),
        "true_false_not_given": (1, 1),
        "multiple_choice": (0, 1),
        "short_answer": (0, 1),
    }


def test_band_comes_from_the_conversion_table(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, ALL_CORRECT)
    result = score_attempt(db, attempt)
    # 4 correct out of 40 on the Academic Reading table
    assert result.band == 2.5


def test_duration_is_measured_from_started_at(db, attempt, reading_test):
    attempt.started_at = datetime.now(UTC) - timedelta(minutes=30)
    db.commit()
    result = score_attempt(db, attempt)
    assert result.duration_seconds >= 1800


# ---------------------------------------------------------------- idempotency


def test_scoring_twice_gives_the_same_result(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, {1: "largest", 2: "T", 3: "B"})
    first = score_attempt(db, attempt)
    scored_at = attempt.scored_at
    submitted_at = attempt.submitted_at
    second = score_attempt(db, attempt)

    assert first.model_dump() == second.model_dump()
    assert attempt.raw_score == 2
    assert attempt.scored_at == scored_at
    assert attempt.submitted_at == submitted_at


def test_scoring_twice_does_not_duplicate_answer_rows(db, attempt, reading_test):
    add_answers(db, attempt, reading_test, ALL_CORRECT)
    score_attempt(db, attempt)
    score_attempt(db, attempt)
    score_attempt(db, attempt)
    assert len(answer_rows(db, attempt)) == 4
    assert attempt.raw_score == 4


def test_rescoring_picks_up_a_corrected_answer_key(db, attempt, reading_test):
    """Re-running after an admin fixes a key must change the score, not double it."""
    add_answers(db, attempt, reading_test, {4: "texture"})
    assert score_attempt(db, attempt).raw_score == 0

    lookup = questions_by_number(reading_test)
    key = db.query(AnswerKey).filter_by(question_id=lookup[4].id).one()
    key.accepted = ["texture"]
    db.commit()

    assert score_attempt(db, attempt).raw_score == 1


# ------------------------------------------------------------- odd test shapes


def build_test(db, user, *, skill: Skill, with_key: bool, question_count: int | None = None) -> tuple:
    test = ExamTest(
        slug=f"fixture-{uuid.uuid4().hex[:8]}",
        skill=skill,
        variant=Variant.ACADEMIC,
        title=f"{skill} fixture",
        duration_seconds=1800,
        question_count=question_count if question_count is not None else 1,
        is_published=True,
    )
    section = Section(order=1, title="Section 1", start_question=1, end_question=1)
    question = Question(number=1, type=QuestionType.SHORT_ANSWER, prompt="Q1")
    section.questions.append(question)
    test.sections.append(section)
    db.add(test)
    db.flush()
    if with_key:
        db.add(
            AnswerKey(
                question_id=question.id,
                accepted=["reef"],
                match_mode=MatchMode.NORMALISED,
            )
        )
    now = datetime.now(UTC)
    attempt = Attempt(
        user_id=user.id,
        test_id=test.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        expires_at=now + timedelta(seconds=1800),
    )
    db.add(attempt)
    db.commit()
    return test, attempt


def test_a_question_without_an_answer_key_is_wrong_not_a_crash(db, user):
    test, attempt = build_test(db, user, skill=Skill.READING, with_key=False)
    add_answers(db, attempt, test, {1: "reef"})
    result = score_attempt(db, attempt)
    assert result.raw_score == 0
    assert result.review[0].reason == "wrong"
    assert result.review[0].correct_answers == []


def test_an_unanswered_question_without_a_key_is_blank(db, user):
    test, attempt = build_test(db, user, skill=Skill.READING, with_key=False)
    result = score_attempt(db, attempt)
    assert result.review[0].reason == "blank"
    assert result.review[0].explanation is None


def test_listening_uses_the_listening_table(db, user):
    test, attempt = build_test(db, user, skill=Skill.LISTENING, with_key=True)
    add_answers(db, attempt, test, {1: "reef"})
    result = score_attempt(db, attempt)
    assert result.skill == Skill.LISTENING
    assert result.raw_score == 1
    assert result.band == 1.0  # 1/40 on the Listening table


def test_a_skill_without_a_band_table_scores_band_zero(db, user):
    test, attempt = build_test(db, user, skill=Skill.WRITING, with_key=True, question_count=0)
    result = score_attempt(db, attempt)
    assert result.band == 0.0
    assert result.total_questions == 1  # falls back to the questions that exist


def test_total_questions_uses_the_declared_count(db, user):
    test, attempt = build_test(db, user, skill=Skill.READING, with_key=True, question_count=40)
    add_answers(db, attempt, test, {1: "reef"})
    result = score_attempt(db, attempt)
    assert result.total_questions == 40
    assert result.raw_score == 1


def test_naive_timestamps_are_treated_as_utc(db, attempt, reading_test):
    attempt.started_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=10)
    attempt.submitted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    result = score_attempt(db, attempt)
    assert 590 <= result.duration_seconds <= 610
