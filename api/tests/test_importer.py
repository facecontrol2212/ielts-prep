"""Content format, importer and CLI.

Two jobs here:

1. every validation rule has a test with a deliberately broken document, and the assertion
   is on the *message* — a rule that fires without naming the question number is useless;
2. every file actually shipped in ``content/`` is validated and imported. That test is the
   guard that keeps the published content correct.
"""

import copy
import json
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.cli import main as cli_main
from app.models import (
    AnswerKey,
    Attempt,
    AttemptAnswer,
    Base,
    Question,
    QuestionGroup,
    Section,
    Test,
)
from app.models.content import SpeakingQuestion
from app.models.enums import AttemptStatus, MatchMode, QuestionType, Skill
from app.schemas.content import (
    ContentValidationError,
    SpeakingBankDocument,
    TestDocument,
    WritingPromptSetDocument,
    load_document,
    parse_document,
)
from app.services.importer import (
    ImportRefused,
    import_directory,
    import_document,
    import_file,
    import_speaking_bank,
    import_test,
    iter_content_files,
)

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"
READING_FILE = CONTENT_DIR / "reading" / "academic-01.json"


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Overrides the shared fixture with a throwaway database of its own.

    The importer commits, and commit/rollback semantics are exactly what is under test
    here, so these tests must not run inside conftest's outer transaction: SAVEPOINT
    handling under pysqlite would quietly change what ``commit`` means.
    """
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# --------------------------------------------------------------------------- helpers


def base_doc() -> dict:
    """A minimal but structurally complete reading test: 3 questions, 2 groups."""
    return {
        "kind": "test",
        "slug": "unit-reading-01",
        "skill": "reading",
        "variant": "academic",
        "title": "Unit Reading Test",
        "question_count": 3,
        "sections": [
            {
                "order": 1,
                "title": "Passage 1",
                "passage_html": (
                    "<p>The capital is Tashkent. Rain fell in May. "
                    "The river is shallow in summer.</p>"
                ),
                "start_question": 1,
                "end_question": 3,
                "groups": [
                    {
                        "order": 1,
                        "type": "true_false_not_given",
                        "instructions": "Write TRUE, FALSE or NOT GIVEN.",
                        "questions": [
                            {
                                "number": 1,
                                "prompt": "Tashkent is the capital.",
                                "evidence": "The capital is Tashkent.",
                                "answer": {"accepted": ["TRUE"], "explanation": "Stated."},
                            }
                        ],
                    },
                    {
                        "order": 2,
                        "type": "sentence_completion",
                        "instructions": (
                            "Complete the sentences. Choose NO MORE THAN TWO WORDS "
                            "from the passage."
                        ),
                        "word_limit": 2,
                        "questions": [
                            {
                                "number": 2,
                                "prompt": "The capital is __________.",
                                "evidence": "The capital is Tashkent.",
                                "answer": {"accepted": ["Tashkent"], "explanation": "Stated."},
                            },
                            {
                                "number": 3,
                                "prompt": "Rain fell in __________.",
                                "evidence": "Rain fell in May.",
                                "answer": {"accepted": ["May"], "explanation": "Stated."},
                            },
                        ],
                    },
                ],
            }
        ],
    }


def broken(mutate) -> dict:
    doc = base_doc()
    mutate(doc)
    return doc


def expect_problems(doc: dict) -> list[str]:
    with pytest.raises(ContentValidationError) as exc:
        parse_document(doc, source="broken.json")
    return exc.value.problems


def first_group(doc: dict) -> dict:
    return doc["sections"][0]["groups"][0]


def second_group(doc: dict) -> dict:
    return doc["sections"][0]["groups"][1]


# --------------------------------------------------------------------- happy path


def test_base_document_is_valid():
    doc = parse_document(base_doc())
    assert isinstance(doc, TestDocument)
    assert len(doc.questions) == 3
    assert doc.evidence_problems() == []
    assert doc.missing_explanations() == []


def test_match_mode_and_options_are_inferred():
    doc = parse_document(base_doc())
    group = doc.sections[0].groups[0]
    q1 = group.questions[0]
    assert q1.resolved_match_mode(group) is MatchMode.OPTION
    assert [o.label for o in q1.resolved_options(group)] == ["TRUE", "FALSE", "NOT GIVEN"]

    text_group = doc.sections[0].groups[1]
    assert text_group.questions[0].resolved_match_mode(text_group) is MatchMode.NORMALISED
    assert text_group.questions[0].resolved_word_limit(text_group) == 2


# ------------------------------------------------------------------ validation rules


def renumber(doc: dict, last: int) -> dict:
    """Change the last question's number, keeping the section range consistent."""
    doc["sections"][0]["groups"][1]["questions"][1]["number"] = last
    doc["sections"][0].pop("end_question")
    doc["sections"][0].pop("start_question")
    return doc


def test_duplicate_question_number_is_rejected_and_named():
    problems = expect_problems(renumber(base_doc(), 2))
    assert any("Q2" in p and "more than once" in p for p in problems)


def test_gap_in_numbering_is_rejected_and_named():
    problems = expect_problems(renumber(base_doc(), 7))
    assert any(p.startswith("Q3:") and "missing" in p for p in problems)
    assert any(p.startswith("Q7:") and "out of range" in p for p in problems)


def test_question_count_must_match_reality():
    problems = expect_problems(broken(lambda d: d.update(question_count=40)))
    assert any("question_count says 40" in p and "defines 3" in p for p in problems)


def test_every_question_needs_at_least_one_accepted_answer():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0]["answer"].update(accepted=[]))
    )
    assert any("accepted" in p for p in problems)


def test_blank_accepted_answer_is_rejected():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0]["answer"].update(accepted=["  "]))
    )
    assert any("must not be blank" in p for p in problems)


def test_option_answer_must_exist_in_the_pool():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0]["answer"].update(accepted=["MAYBE"]))
    )
    assert problems == [
        "Q1: accepted answer 'MAYBE' is not in the option pool (TRUE, FALSE, NOT GIVEN)"
    ]


def test_matching_headings_answer_must_exist_in_the_group_pool():
    def mutate(d):
        d["sections"][0]["groups"] = [
            {
                "order": 1,
                "type": "matching_headings",
                "instructions": "Choose the correct heading.",
                "options": [
                    {"label": "i", "text": "One"},
                    {"label": "ii", "text": "Two"},
                ],
                "questions": [
                    {
                        "number": n,
                        "prompt": f"Paragraph {n}",
                        "answer": {"accepted": [a], "explanation": "e"},
                    }
                    for n, a in ((1, "i"), (2, "ii"), (3, "iv"))
                ],
            }
        ]

    problems = expect_problems(broken(mutate))
    assert problems == ["Q3: accepted answer 'iv' is not in the option pool (i, ii)"]


def test_single_option_type_takes_exactly_one_label():
    problems = expect_problems(
        broken(
            lambda d: first_group(d)["questions"][0]["answer"].update(accepted=["TRUE", "FALSE"])
        )
    )
    assert any("Q1" in p and "exactly one accepted label" in p for p in problems)


def test_no_more_than_in_instructions_requires_a_word_limit():
    problems = expect_problems(broken(lambda d: second_group(d).pop("word_limit")))
    assert len(problems) == 1
    assert "NO MORE THAN" in problems[0]
    assert "Q2, Q3" in problems[0]
    assert problems[0].startswith("Q2-3:")


def test_word_limit_may_be_declared_per_question_instead():
    doc = base_doc()
    second_group(doc).pop("word_limit")
    for q in second_group(doc)["questions"]:
        q["word_limit"] = 2
    assert parse_document(doc) is not None


def test_accepted_answer_over_the_word_limit_is_rejected():
    problems = expect_problems(
        broken(
            lambda d: second_group(d)["questions"][0]["answer"].update(
                accepted=["the beautiful city of Tashkent"]
            )
        )
    )
    assert any(p.startswith("Q2:") and "over the limit of 2 word(s)" in p for p in problems)


def test_a_number_is_allowed_on_top_of_the_word_limit_when_declared():
    doc = base_doc()
    second_group(doc)["allow_number"] = True
    second_group(doc)["questions"][1]["answer"]["accepted"] = ["12 May"]
    assert parse_document(doc) is not None

    # without allow_number a numeral simply counts as one of the two words
    doc2 = base_doc()
    second_group(doc2)["questions"][1]["answer"]["accepted"] = ["12 May"]
    assert parse_document(doc2) is not None

    doc3 = base_doc()
    second_group(doc3)["questions"][1]["answer"]["accepted"] = ["on 12 May"]
    assert any(p.startswith("Q3:") for p in expect_problems(doc3))


def test_match_mode_must_suit_the_question_type():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0]["answer"].update(match_mode="normalised"))
    )
    assert any(
        "Q1" in p and "match_mode 'normalised' is not valid" in p and "option" in p
        for p in problems
    )


def test_text_question_may_not_use_option_match_mode():
    problems = expect_problems(
        broken(lambda d: second_group(d)["questions"][0]["answer"].update(match_mode="option"))
    )
    assert any(
        "Q2" in p and "not valid for question type 'sentence_completion'" in p for p in problems
    )


def test_word_limit_on_an_option_question_is_an_error():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0].update(word_limit=2))
    )
    assert any("Q1" in p and "word_limit makes no sense" in p for p in problems)


def test_multi_select_requires_select_count_and_a_matching_key():
    def mutate(d):
        d["question_count"] = 1
        d["sections"][0]["end_question"] = 1
        d["sections"][0]["groups"] = [
            {
                "order": 1,
                "type": "multiple_choice_multi",
                "instructions": "Choose TWO letters.",
                "options": [{"label": x, "text": x} for x in "ABCDE"],
                "questions": [
                    {
                        "number": 1,
                        "prompt": "Which two?",
                        "answer": {"accepted": ["A", "C"], "explanation": "e"},
                    }
                ],
            }
        ]

    problems = expect_problems(broken(mutate))
    assert problems == ["Q1: 'multiple_choice_multi' requires select_count on the group"]


def test_multi_select_count_must_equal_the_number_of_accepted_labels():
    def mutate(d):
        d["question_count"] = 1
        d["sections"][0]["end_question"] = 1
        d["sections"][0]["groups"] = [
            {
                "order": 1,
                "type": "multiple_choice_multi",
                "instructions": "Choose TWO letters.",
                "select_count": 2,
                "options": [{"label": x, "text": x} for x in "ABCDE"],
                "questions": [
                    {
                        "number": 1,
                        "prompt": "Which two?",
                        "answer": {"accepted": ["A", "C", "E"], "explanation": "e"},
                    }
                ],
            }
        ]

    problems = expect_problems(broken(mutate))
    assert any("Q1" in p and "select_count is 2" in p for p in problems)


def test_duplicate_option_labels_in_a_pool_are_rejected():
    def mutate(d):
        first_group(d)["options"] = [
            {"label": "A", "text": "one"},
            {"label": "A", "text": "two"},
        ]
        first_group(d)["questions"][0]["answer"]["accepted"] = ["A"]

    problems = expect_problems(broken(mutate))
    assert any("appears twice" in p for p in problems)


def test_section_start_question_must_match_the_questions():
    problems = expect_problems(broken(lambda d: d["sections"][0].update(start_question=5)))
    assert any("start_question is 5" in p and "Q1" in p for p in problems)


def test_reading_section_needs_a_passage():
    problems = expect_problems(broken(lambda d: d["sections"][0].pop("passage_html")))
    assert any("reading needs passage_html" in p for p in problems)


def test_listening_needs_audio_transcript_and_timestamps():
    doc = base_doc()
    doc["skill"] = "listening"
    doc["slug"] = "unit-listening-01"
    problems = expect_problems(doc)
    assert any("listening needs audio_url" in p for p in problems)
    assert any("needs a transcript" in p for p in problems)
    assert any(p.startswith("Q1:") and "audio_timestamp" in p for p in problems)


def test_slug_must_be_kebab_case():
    problems = expect_problems(broken(lambda d: d.update(slug="Unit Reading 01")))
    assert any("must be lowercase-with-hyphens" in p for p in problems)


def test_unknown_field_is_rejected():
    problems = expect_problems(
        broken(lambda d: first_group(d)["questions"][0].update(anwser="typo"))
    )
    assert any("anwser" in p or "Extra inputs" in p for p in problems)


def test_numbers_must_increase_in_document_order():
    def mutate(d):
        first_group(d)["questions"][0]["number"] = 3
        second_group(d)["questions"][0]["number"] = 1
        second_group(d)["questions"][1]["number"] = 2

    problems = expect_problems(broken(mutate))
    assert any("increase in document order" in p for p in problems)


# ---------------------------------------------------------------- speaking / writing rules


def speaking_doc() -> dict:
    return {
        "kind": "speaking_bank",
        "questions": [
            {
                "part": "part_1",
                "topic": "Hometown",
                "question": "Where is your hometown?",
                "model_answer": "I'm from Bukhara, in the south of Uzbekistan.",
            },
            {
                "part": "part_2",
                "topic": "A useful object",
                "question": "Describe an object you find useful.",
                "cue_points": ["what it is", "where you got it", "and explain why"],
                "model_answer": "word " * 120,
            },
            {
                "part": "part_3",
                "topic": "A useful object",
                "question": "Do people own too many things these days?",
                "model_answer": "Probably, yes. Advertising makes ownership feel normal.",
            },
        ],
    }


def test_speaking_bank_is_valid():
    doc = parse_document(speaking_doc())
    assert isinstance(doc, SpeakingBankDocument)
    assert len(doc.questions) == 3


def test_part_2_needs_cue_points_and_a_full_length_model_answer():
    doc = speaking_doc()
    doc["questions"][1]["cue_points"] = ["only one"]
    doc["questions"][1]["model_answer"] = "Too short."
    problems = expect_problems(doc)
    assert any("at least 3 cue_points" in p for p in problems)
    assert any(">=100 words" in p for p in problems)


def test_cue_points_are_rejected_outside_part_2():
    doc = speaking_doc()
    doc["questions"][0]["cue_points"] = ["a", "b", "c"]
    assert any("cue_points belong to Part 2 only" in p for p in expect_problems(doc))


def test_part_3_topic_must_come_from_a_part_2_cue_card():
    doc = speaking_doc()
    doc["questions"][2]["topic"] = "Something else"
    assert any("no Part 2 cue card uses" in p for p in expect_problems(doc))


def test_duplicate_speaking_question_is_rejected():
    doc = speaking_doc()
    doc["questions"].append(copy.deepcopy(doc["questions"][0]))
    assert any("duplicate question" in p for p in expect_problems(doc))


def writing_doc() -> dict:
    return {
        "kind": "writing_prompts",
        "prompts": [
            {
                "slug": "unit-writing-t1",
                "task_number": 1,
                "title": "Energy use",
                "prompt_html": "<p>The chart below shows energy use.</p>",
                "visual_description": (
                    "A bar chart showing household energy use in a single country in 2024, "
                    "measured as a percentage of total consumption. Four bars are shown: "
                    "space heating 44 per cent, water heating 22 per cent, appliances 20 "
                    "per cent and lighting 14 per cent. The vertical axis runs from 0 to 50 "
                    "per cent in steps of ten."
                ),
                "min_words": 150,
            },
            {
                "slug": "unit-writing-t2",
                "task_number": 2,
                "title": "Remote work",
                "prompt_html": "<p>To what extent do you agree?</p>",
                "min_words": 250,
            },
        ],
    }


def test_writing_prompt_set_is_valid():
    doc = parse_document(writing_doc())
    assert isinstance(doc, WritingPromptSetDocument)
    assert doc.prompts[0].effective_duration == 1200
    assert doc.prompts[1].effective_min_words == 250


def test_task_1_requires_a_visual_description():
    doc = writing_doc()
    doc["prompts"][0].pop("visual_description")
    assert any("needs a visual_description" in p for p in expect_problems(doc))


def test_task_1_visual_description_must_actually_describe_the_chart():
    doc = writing_doc()
    doc["prompts"][0]["visual_description"] = "A bar chart with four bars."
    assert any("only 6 words" in p for p in expect_problems(doc))


def test_writing_section_with_an_image_needs_an_image_description():
    doc = {
        "kind": "test",
        "slug": "unit-writing-test",
        "skill": "writing",
        "title": "Writing",
        "question_count": 0,
        "sections": [
            {
                "order": 1,
                "title": "Task 1",
                "prompt_html": "<p>Describe the chart.</p>",
                "image_url": "/media/writing/chart.png",
            }
        ],
    }
    assert any("needs an image_description" in p for p in expect_problems(doc))


def test_task_2_rejects_a_visual_description_and_a_wrong_word_count():
    doc = writing_doc()
    doc["prompts"][1]["visual_description"] = "A chart"
    doc["prompts"][1]["min_words"] = 150
    problems = expect_problems(doc)
    assert any("Task 2 has no visual" in p for p in problems)
    assert any("min_words must be 250" in p for p in problems)


def test_duplicate_writing_slug_is_rejected():
    doc = writing_doc()
    doc["prompts"][1]["slug"] = doc["prompts"][0]["slug"]
    assert any("duplicate prompt slug" in p for p in expect_problems(doc))


# ------------------------------------------------------------------------- importing


def test_import_creates_the_whole_tree(db):
    summary = import_test(db, parse_document(base_doc()))

    assert summary.action == "created"
    assert (summary.sections, summary.groups, summary.questions, summary.answer_keys) == (
        1,
        2,
        3,
        3,
    )
    test = db.scalar(select(Test).where(Test.slug == "unit-reading-01"))
    assert test is not None
    assert test.question_count == 3
    assert test.is_published is False

    section = test.sections[0]
    assert section.start_question == 1 and section.end_question == 3
    assert [q.number for q in section.questions] == [1, 2, 3]

    tfng = next(q for q in section.questions if q.number == 1)
    assert tfng.type == QuestionType.TRUE_FALSE_NOT_GIVEN
    assert tfng.answer_key.match_mode == MatchMode.OPTION
    assert tfng.group.options == [
        {"label": "TRUE", "text": "True"},
        {"label": "FALSE", "text": "False"},
        {"label": "NOT GIVEN", "text": "Not Given"},
    ]

    gap = next(q for q in section.questions if q.number == 2)
    assert gap.word_limit == 2
    assert gap.answer_key.accepted == ["Tashkent"]
    assert gap.answer_key.explanation == "Stated."
    assert gap.evidence == "The capital is Tashkent."


def test_reimport_updates_in_place_without_duplicating(db):
    first = import_test(db, parse_document(base_doc()))
    old_question_ids = set(
        db.scalars(select(Question.id).join(Section).where(Section.test_id == first.test_id))
    )

    doc = base_doc()
    doc["title"] = "Unit Reading Test (revised)"
    doc["sections"][0]["groups"][1]["questions"][1]["answer"]["accepted"] = ["May", "in May"]
    second = import_test(db, parse_document(doc))

    assert second.action == "updated"
    assert second.test_id == first.test_id, "the tests row keeps its id across a re-import"
    assert db.scalar(select(func.count()).select_from(Test)) == 1
    assert db.scalar(select(func.count()).select_from(Section)) == 1
    assert db.scalar(select(func.count()).select_from(QuestionGroup)) == 2
    assert db.scalar(select(func.count()).select_from(Question)) == 3
    assert db.scalar(select(func.count()).select_from(AnswerKey)) == 3

    test = db.get(Test, first.test_id)
    db.refresh(test)
    assert test.title == "Unit Reading Test (revised)"

    new_question_ids = set(
        db.scalars(select(Question.id).join(Section).where(Section.test_id == first.test_id))
    )
    # documented behaviour: children are delete-and-recreate, so their ids change
    assert new_question_ids.isdisjoint(old_question_ids)


def test_reimport_keeps_the_published_flag_when_the_document_omits_it(db):
    summary = import_test(db, parse_document(base_doc()))
    test = db.get(Test, summary.test_id)
    test.is_published = True
    db.commit()

    import_test(db, parse_document(base_doc()))
    db.refresh(test)
    assert test.is_published is True


def test_document_can_set_the_published_flag_explicitly(db):
    doc = base_doc()
    doc["is_published"] = True
    summary = import_test(db, parse_document(doc))
    assert db.get(Test, summary.test_id).is_published is True


def test_reimport_is_refused_when_a_scored_attempt_exists(db, user):
    from datetime import UTC, datetime, timedelta

    summary = import_test(db, parse_document(base_doc()))
    now = datetime.now(UTC)
    db.add(
        Attempt(
            user_id=user.id,
            test_id=summary.test_id,
            status=AttemptStatus.SCORED,
            started_at=now,
            expires_at=now + timedelta(hours=1),
        )
    )
    db.commit()

    with pytest.raises(ImportRefused) as exc:
        import_test(db, parse_document(base_doc()))
    assert "scored attempt" in str(exc.value)
    assert "force" in str(exc.value)


def test_force_overrides_the_refusal_and_reports_deleted_answers(db, user):
    from datetime import UTC, datetime, timedelta

    summary = import_test(db, parse_document(base_doc()))
    now = datetime.now(UTC)
    attempt = Attempt(
        user_id=user.id,
        test_id=summary.test_id,
        status=AttemptStatus.SCORED,
        started_at=now,
        expires_at=now + timedelta(hours=1),
    )
    db.add(attempt)
    db.flush()
    question_id = db.scalar(
        select(Question.id).join(Section).where(Section.test_id == summary.test_id)
    )
    db.add(AttemptAnswer(attempt_id=attempt.id, question_id=question_id, value="TRUE"))
    db.commit()

    again = import_test(db, parse_document(base_doc()), force=True)
    assert again.action == "updated"
    assert any("saved answer" in w for w in again.warnings)
    assert db.scalar(select(func.count()).select_from(AttemptAnswer)) == 0


def test_a_failed_import_leaves_nothing_behind(db):
    import_test(db, parse_document(base_doc()))

    doc = parse_document(base_doc())
    doc.sections[0].groups[1].questions[1].number = 1  # duplicate at the ORM level
    with pytest.raises(IntegrityError):
        import_test(db, doc)

    # the importer commits only once, at the very end, so nothing of the failed run was
    # committed; the caller (CLI / admin router / import_directory) rolls the session back
    db.rollback()
    assert db.scalar(select(func.count()).select_from(Test)) == 1
    assert db.scalar(select(func.count()).select_from(Section)) == 1
    assert db.scalar(select(func.count()).select_from(Question)) == 3
    assert db.scalar(select(func.count()).select_from(Question)) == 3


def test_writing_prompts_import_as_one_test_each(db):
    summaries = import_document(db, parse_document(writing_doc()))
    assert len(summaries) == 2
    assert {s.slug for s in summaries} == {"unit-writing-t1", "unit-writing-t2"}

    t1 = db.scalar(select(Test).where(Test.slug == "unit-writing-t1"))
    assert t1.skill == Skill.WRITING
    assert t1.question_count == 0
    assert t1.duration_seconds == 1200
    assert len(t1.sections) == 1
    assert t1.sections[0].min_words == 150
    assert "bar chart" in t1.sections[0].prompt_html
    # the AI grader never sees the image, so the description lands in its own column
    assert "space heating 44 per cent" in t1.sections[0].image_description


def test_speaking_bank_upserts_on_question_text(db):
    summary = import_speaking_bank(db, parse_document(speaking_doc()))
    assert summary.items == 3
    assert (summary.created, summary.updated) == (3, 0)
    assert db.scalar(select(func.count()).select_from(SpeakingQuestion)) == 3

    doc = speaking_doc()
    doc["questions"][0]["model_answer"] = "Rewritten model answer."
    again = import_speaking_bank(db, parse_document(doc))
    assert (again.created, again.updated) == (0, 3)

    assert db.scalar(select(func.count()).select_from(SpeakingQuestion)) == 3
    row = db.scalar(
        select(SpeakingQuestion).where(SpeakingQuestion.question == "Where is your hometown?")
    )
    assert row.model_answer == "Rewritten model answer."


def test_speaking_bank_prune_removes_rows_no_longer_in_the_file(db):
    import_speaking_bank(db, parse_document(speaking_doc()))
    doc = speaking_doc()
    doc["questions"] = doc["questions"][:2]
    doc["questions"][1]["topic"] = "A useful object"
    summary = import_speaking_bank(db, parse_document(doc), prune=True)
    assert any("pruned 1" in w for w in summary.warnings)
    assert db.scalar(select(func.count()).select_from(SpeakingQuestion)) == 2


# --------------------------------------------------------------- the shipped content


def test_content_directory_is_not_empty():
    files = iter_content_files(CONTENT_DIR)
    assert files, f"no content files found under {CONTENT_DIR}"


@pytest.mark.parametrize("path", iter_content_files(CONTENT_DIR), ids=lambda p: p.name)
def test_every_shipped_content_file_validates(path: Path):
    """The guard that keeps published content correct."""
    document = load_document(path)
    if isinstance(document, TestDocument):
        assert document.evidence_problems() == [], "evidence must be verbatim in the text"
        assert document.missing_explanations() == [], "every answer key needs an explanation"


def test_shipped_reading_test_is_a_complete_academic_paper():
    doc = load_document(READING_FILE)
    assert doc.skill is Skill.READING
    assert doc.question_count == 40 and len(doc.questions) == 40
    assert len(doc.sections) == 3
    for section in doc.sections:
        words = len(section.passage_html.split())
        assert 650 <= words <= 1000, f"passage {section.order} is {words} words"
    types = {q.resolved_type(g) for s in doc.sections for g in s.groups for q in g.questions}
    assert len(types) >= 6, types
    assert QuestionType.TRUE_FALSE_NOT_GIVEN in types
    assert QuestionType.MATCHING_HEADINGS in types
    assert QuestionType.MATCHING_FEATURES in types
    assert QuestionType.SENTENCE_COMPLETION in types
    assert QuestionType.SUMMARY_COMPLETION in types
    assert QuestionType.MULTIPLE_CHOICE in types
    assert all(q.evidence for q in doc.questions)
    assert all(q.answer.explanation for q in doc.questions)


def test_round_trip_import_of_the_real_reading_test(db):
    summary = import_file(db, READING_FILE)
    assert summary[0].action == "created"
    assert summary[0].questions == 40
    assert summary[0].answer_keys == 40
    assert summary[0].warnings == []

    test = db.scalar(select(Test).where(Test.slug == "reading-academic-01"))
    assert test.question_count == 40
    assert len(test.sections) == 3
    numbers = sorted(q.number for s in test.sections for q in s.questions)
    assert numbers == list(range(1, 41))
    keys = db.scalars(select(AnswerKey)).all()
    assert len(keys) == 40
    assert all(k.accepted for k in keys)

    # re-import: no duplication, same test row
    again = import_file(db, READING_FILE)
    assert again[0].action == "updated"
    assert again[0].test_id == summary[0].test_id
    assert db.scalar(select(func.count()).select_from(Test)) == 1
    assert db.scalar(select(func.count()).select_from(Question)) == 40
    assert db.scalar(select(func.count()).select_from(AnswerKey)) == 40


def test_import_directory_loads_every_shipped_file(db):
    summaries, failures = import_directory(db, CONTENT_DIR)
    assert failures == [], [f"{p}: {e}" for p, e in failures]
    assert summaries
    assert db.scalar(select(func.count()).select_from(Test)) >= 1

    # idempotent: running it twice changes nothing but the action labels
    tests_before = db.scalar(select(func.count()).select_from(Test))
    questions_before = db.scalar(select(func.count()).select_from(Question))
    summaries2, failures2 = import_directory(db, CONTENT_DIR)
    assert failures2 == []
    assert all(s.action == "updated" for s in summaries2 if s.kind == "test")
    assert db.scalar(select(func.count()).select_from(Test)) == tests_before
    assert db.scalar(select(func.count()).select_from(Question)) == questions_before


# ------------------------------------------------------------------------------ CLI


def test_cli_validate_accepts_the_shipped_content(capsys):
    assert cli_main(["validate", str(CONTENT_DIR)]) == 0
    out = capsys.readouterr().out
    assert "file(s) valid" in out
    assert "FAIL" not in out


def test_cli_validate_reports_the_question_number_of_a_broken_file(tmp_path, capsys):
    doc = base_doc()
    doc["sections"][0]["groups"][0]["questions"][0]["answer"]["accepted"] = ["MAYBE"]
    path = tmp_path / "broken.json"
    path.write_text(json.dumps(doc), encoding="utf-8")

    assert cli_main(["validate", str(path)]) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out
    assert "Q1: accepted answer 'MAYBE' is not in the option pool" in out


def test_cli_validate_reports_invalid_json(tmp_path, capsys):
    path = tmp_path / "bad.json"
    path.write_text("{not json", encoding="utf-8")
    assert cli_main(["validate", str(path)]) == 1
    assert "invalid JSON" in capsys.readouterr().out


def test_cli_seed_bands_reports_clearly_when_the_scoring_module_is_missing(capsys, monkeypatch):
    """Agent A owns app.services.scoring.bands; a missing module must fail loudly."""
    import sys

    monkeypatch.setitem(sys.modules, "app.services.scoring.bands", None)
    assert cli_main(["seed-bands"]) == 1
    out = capsys.readouterr().out
    assert "band tables are not available yet" in out
    assert "seed_band_tables" in out


def test_cli_seed_bands_loads_the_tables_when_the_module_exists(db, capsys, monkeypatch):
    pytest.importorskip("app.services.scoring.bands")
    from app.models import BandTable

    monkeypatch.setattr("app.core.db.SessionLocal", lambda: db)
    assert cli_main(["seed-bands"]) == 0
    assert "band tables seeded" in capsys.readouterr().out
    assert db.scalar(select(func.count()).select_from(BandTable)) > 0


def test_cli_import_and_import_dir_write_to_the_database(db, capsys, monkeypatch):
    monkeypatch.setattr("app.core.db.SessionLocal", lambda: db)

    assert cli_main(["import", str(READING_FILE)]) == 0
    out = capsys.readouterr().out
    assert "created" in out and "40 question(s)" in out
    assert (
        db.scalar(select(func.count()).select_from(Test).where(Test.slug == "reading-academic-01"))
        == 1
    )

    assert cli_main(["import-dir", str(CONTENT_DIR)]) == 0
    out = capsys.readouterr().out
    assert "0 failed" in out
    assert "updated" in out


def test_cli_seed_speaking_loads_the_bank(db, capsys, monkeypatch):
    monkeypatch.setattr("app.core.db.SessionLocal", lambda: db)
    bank = CONTENT_DIR / "speaking" / "questions.json"
    assert cli_main(["seed-speaking", str(bank)]) == 0
    assert "item(s)" in capsys.readouterr().out
    assert db.scalar(select(func.count()).select_from(SpeakingQuestion)) == 40


def test_cli_import_refuses_a_test_with_scored_attempts(db, capsys, monkeypatch, user):
    from datetime import UTC, datetime, timedelta

    monkeypatch.setattr("app.core.db.SessionLocal", lambda: db)
    assert cli_main(["import", str(READING_FILE)]) == 0
    capsys.readouterr()

    test_id = db.scalar(select(Test.id).where(Test.slug == "reading-academic-01"))
    now = datetime.now(UTC)
    db.add(
        Attempt(
            user_id=user.id,
            test_id=test_id,
            status=AttemptStatus.SCORED,
            started_at=now,
            expires_at=now + timedelta(hours=1),
        )
    )
    db.commit()

    assert cli_main(["import", str(READING_FILE)]) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out and "scored attempt" in out

    assert cli_main(["import", str(READING_FILE), "--force"]) == 0
    assert "updated" in capsys.readouterr().out
