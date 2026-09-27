"""Table-driven tests for marking one answer: one table per question type and per rule."""

import pytest

from app.models.enums import MatchMode, QuestionType
from app.models.test import AnswerKey, Question, QuestionGroup
from app.services.scoring import AnswerCheck, check_answer
from app.services.scoring.checker import (
    REASON_BLANK,
    REASON_OVER_WORD_LIMIT,
    REASON_SPELLING,
    REASON_WRONG,
    as_labels,
    as_text,
    canonical_label,
    is_blank,
    resolve_word_limit,
)

TEXT_TYPES = [
    QuestionType.SENTENCE_COMPLETION,
    QuestionType.SUMMARY_COMPLETION,
    QuestionType.NOTE_COMPLETION,
    QuestionType.TABLE_COMPLETION,
    QuestionType.FLOW_CHART_COMPLETION,
    QuestionType.FORM_COMPLETION,
    QuestionType.SHORT_ANSWER,
    QuestionType.DIAGRAM_LABELLING,
    QuestionType.MAP_LABELLING,
]

OPTION_TYPES = [
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.TRUE_FALSE_NOT_GIVEN,
    QuestionType.YES_NO_NOT_GIVEN,
    QuestionType.MATCHING_HEADINGS,
    QuestionType.MATCHING_INFORMATION,
    QuestionType.MATCHING_FEATURES,
    QuestionType.MATCHING_SENTENCE_ENDINGS,
]


def make_question(
    qtype: QuestionType = QuestionType.SENTENCE_COMPLETION,
    *,
    word_limit: int | None = None,
    allow_number: bool = False,
    group: QuestionGroup | None = None,
) -> Question:
    question = Question(
        number=1,
        type=qtype,
        prompt="prompt",
        word_limit=word_limit,
        allow_number=allow_number,
    )
    if group is not None:
        question.group = group
    return question


def make_group(*, word_limit: int | None = None, allow_number: bool = False) -> QuestionGroup:
    return QuestionGroup(
        order=1,
        type=QuestionType.SENTENCE_COMPLETION,
        instructions="instructions",
        word_limit=word_limit,
        allow_number=allow_number,
    )


def make_key(
    accepted: list,
    mode: MatchMode = MatchMode.NORMALISED,
    *,
    allow_optional_article: bool = True,
) -> AnswerKey:
    return AnswerKey(
        accepted=accepted,
        match_mode=mode,
        allow_optional_article=allow_optional_article,
    )


# ----------------------------------------------------------------- blank rule


@pytest.mark.parametrize(
    "value",
    [None, "", "   ", "\t\n", [], [""], ["", None], set()],
)
def test_blank_answers_are_wrong_with_reason_blank(value):
    check = check_answer(make_question(), make_key(["reef"]), value)
    assert check == AnswerCheck(False, REASON_BLANK)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, True),
        ("", True),
        ("  ", True),
        ([], True),
        ([""], True),
        (("", None), True),
        ("reef", False),
        (0, False),
        (False, False),
        (["A"], False),
    ],
)
def test_is_blank(value, expected):
    assert is_blank(value) is expected


# ---------------------------------------------------------- value coercion


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("reef", "reef"),
        (["reef"], "reef"),
        (("reef",), "reef"),
        (["a", "b"], None),  # a list where a string was expected, and not a 1-list
        (5, "5"),
        (2.5, "2.5"),
        (True, None),  # a boolean is not an answer
        ({"a": 1}, None),
    ],
)
def test_as_text(value, expected):
    assert as_text(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("B", ["B"]),
        ("B, D", ["B", "D"]),
        ("B,,D", ["B", "D"]),
        (["B", "D"], ["B", "D"]),
        (("B",), ["B"]),
        (None, []),
        (5, ["5"]),
    ],
)
def test_as_labels(value, expected):
    assert as_labels(value) == expected


@pytest.mark.parametrize(
    ("raw", "qtype", "expected"),
    [
        ("T", QuestionType.TRUE_FALSE_NOT_GIVEN, "true"),
        ("true", QuestionType.TRUE_FALSE_NOT_GIVEN, "true"),
        ("TRUE", QuestionType.TRUE_FALSE_NOT_GIVEN, "true"),
        ("f", QuestionType.TRUE_FALSE_NOT_GIVEN, "false"),
        ("NG", QuestionType.TRUE_FALSE_NOT_GIVEN, "not given"),
        ("not  given", QuestionType.TRUE_FALSE_NOT_GIVEN, "not given"),
        ("not_given", QuestionType.TRUE_FALSE_NOT_GIVEN, "not given"),
        ("Y", QuestionType.YES_NO_NOT_GIVEN, "yes"),
        ("N", QuestionType.YES_NO_NOT_GIVEN, "no"),
        ("NG", QuestionType.YES_NO_NOT_GIVEN, "not given"),
        ("maybe", QuestionType.YES_NO_NOT_GIVEN, "maybe"),
        (" a ", QuestionType.MULTIPLE_CHOICE, "a"),
        ("iv", QuestionType.MATCHING_HEADINGS, "iv"),
    ],
)
def test_canonical_label(raw, qtype, expected):
    assert canonical_label(raw, qtype) == expected


# ----------------------------------------------------- MatchMode.OPTION table


@pytest.mark.parametrize("qtype", OPTION_TYPES)
def test_every_option_type_marks_a_correct_answer(qtype):
    check = check_answer(make_question(qtype), make_key(["B"], MatchMode.OPTION), "B")
    assert check.is_correct
    assert check.matched == "B"


@pytest.mark.parametrize("qtype", OPTION_TYPES)
def test_every_option_type_marks_a_wrong_answer(qtype):
    check = check_answer(make_question(qtype), make_key(["B"], MatchMode.OPTION), "C")
    assert check == AnswerCheck(False, REASON_WRONG)


@pytest.mark.parametrize(
    ("accepted", "value", "correct"),
    [
        (["B"], "B", True),
        (["B"], "b", True),
        (["B"], " b ", True),
        (["B"], ["B"], True),  # a one-element list is the same single choice
        (["B"], "C", False),
        (["B"], "Z", False),  # an option label that does not exist
        (["B"], ["B", "C"], False),  # a list where a single label was expected
        (["iv"], "IV", True),
        ([], "B", False),  # a key with an empty accepted list
        ([None], "B", False),  # a malformed key entry is skipped, not crashed on
    ],
)
def test_option_matching(accepted, value, correct):
    check = check_answer(
        make_question(QuestionType.MULTIPLE_CHOICE),
        make_key(accepted, MatchMode.OPTION),
        value,
    )
    assert check.is_correct is correct


@pytest.mark.parametrize(
    ("qtype", "accepted", "value", "correct"),
    [
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["TRUE"], "T", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["TRUE"], "true", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["TRUE"], "True", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["TRUE"], "F", False),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["FALSE"], "f", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["NOT GIVEN"], "NG", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["NOT GIVEN"], "not given", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["NOT GIVEN"], "Not Given", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["NOT GIVEN"], "n/g", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["NG"], "NOT GIVEN", True),
        (QuestionType.TRUE_FALSE_NOT_GIVEN, ["TRUE"], "yes", False),
        (QuestionType.YES_NO_NOT_GIVEN, ["YES"], "Y", True),
        (QuestionType.YES_NO_NOT_GIVEN, ["NO"], "N", True),
        (QuestionType.YES_NO_NOT_GIVEN, ["NO"], "no", True),
        (QuestionType.YES_NO_NOT_GIVEN, ["NOT GIVEN"], "ng", True),
        (QuestionType.YES_NO_NOT_GIVEN, ["YES"], "N", False),
    ],
)
def test_true_false_not_given_spellings(qtype, accepted, value, correct):
    check = check_answer(make_question(qtype), make_key(accepted, MatchMode.OPTION), value)
    assert check.is_correct is correct


# ------------------------------------------------- MatchMode.OPTION_SET table


@pytest.mark.parametrize(
    ("accepted", "value", "correct"),
    [
        (["B", "D"], ["B", "D"], True),
        (["B", "D"], ["D", "B"], True),  # unordered
        (["B", "D"], ["b", "d"], True),
        (["B", "D"], "B, D", True),  # a string where a list was expected
        (["B", "D"], "B,D", True),
        (["B", "D"], ["B", "D", "E"], False),  # an extra selection
        (["B", "D"], ["B"], False),  # a missing selection: no partial credit
        (["B", "D"], ["B", "C"], False),
        (["B", "D"], ["B", "B", "D"], True),  # a duplicate is still one selection
        (["B", "D"], "B", False),
        ([], ["B"], False),  # a key with an empty accepted list
        ([None], ["B"], False),
    ],
)
def test_option_set_matching(accepted, value, correct):
    check = check_answer(
        make_question(QuestionType.MULTIPLE_CHOICE_MULTI),
        make_key(accepted, MatchMode.OPTION_SET),
        value,
    )
    assert check.is_correct is correct


def test_option_set_reports_the_full_key_as_matched():
    check = check_answer(
        make_question(QuestionType.MULTIPLE_CHOICE_MULTI),
        make_key(["D", "B"], MatchMode.OPTION_SET),
        ["B", "D"],
    )
    assert check.matched == "B, D"


def test_multiple_choice_multi_is_blank_when_nothing_selected():
    check = check_answer(
        make_question(QuestionType.MULTIPLE_CHOICE_MULTI),
        make_key(["B", "D"], MatchMode.OPTION_SET),
        [],
    )
    assert check == AnswerCheck(False, REASON_BLANK)


# ------------------------------------------------- MatchMode.NORMALISED table


@pytest.mark.parametrize("qtype", TEXT_TYPES)
def test_every_text_type_marks_a_correct_answer(qtype):
    check = check_answer(make_question(qtype), make_key(["colour", "color"]), "Colour.")
    assert check.is_correct
    assert check.matched == "colour"


@pytest.mark.parametrize("qtype", TEXT_TYPES)
def test_every_text_type_marks_a_wrong_answer(qtype):
    check = check_answer(make_question(qtype), make_key(["colour", "color"]), "texture")
    assert check == AnswerCheck(False, REASON_WRONG)


@pytest.mark.parametrize(
    ("accepted", "value", "correct"),
    [
        (["colour", "color"], "colour", True),  # British/American from the key
        (["colour", "color"], "color", True),
        (["colour"], "COLOUR", True),
        (["colour"], " colour ", True),
        (["colour"], "colour.", True),
        (["colour"], "“colour”", True),
        (["air conditioning"], "air-conditioning", True),
        (["air-conditioning"], "air conditioning", True),
        (["25"], "twenty five", True),
        (["25"], "twenty-five", True),
        (["twenty five"], "25", True),
        (["1990s"], "1990's", True),
        (["2.5"], "two and a half", True),
        (["third"], "3rd", True),
        (["largest coral reef system"], "  largest   coral reef system  ", True),
        (["largest coral reef system"], "the Great Barrier", False),
        ([], "anything", False),  # a key with an empty accepted list
        ([""], "anything", False),  # a blank key entry never matches
        (["."], "...", False),  # neither does a punctuation-only one
        (["colour"], ["colour"], True),  # one-element list
        (["colour"], ["colour", "color"], False),  # list where a string was expected
        (["colour"], 25, False),
    ],
)
def test_normalised_matching(accepted, value, correct):
    check = check_answer(make_question(), make_key(accepted), value)
    assert check.is_correct is correct


@pytest.mark.parametrize(
    ("accepted", "value", "allow_article", "correct"),
    [
        (["museum"], "the museum", True, True),
        (["museum"], "a museum", True, True),
        (["the museum"], "museum", True, True),
        (["museum"], "the museum", False, False),
        (["the museum"], "museum", False, False),
        (["the museum"], "the museum", False, True),
    ],
)
def test_optional_leading_article(accepted, value, allow_article, correct):
    key = make_key(accepted, allow_optional_article=allow_article)
    assert check_answer(make_question(), key, value).is_correct is correct


# ------------------------------------------------------ MatchMode.EXACT table


@pytest.mark.parametrize(
    ("accepted", "value", "correct"),
    [
        (["AB-12"], "AB-12", True),
        (["AB-12"], "ab-12", True),  # case-fold
        (["AB-12"], "  AB-12  ", True),  # trim
        (["AB-12"], "AB 12", False),  # no hyphen tolerance in exact mode
        (["AB-12"], "AB-12.", False),  # no punctuation stripping either
        (["five"], "5", False),  # no number equivalence
        ([], "AB-12", False),
        ([None], "AB-12", False),
        (["AB-12"], ["AB-12", "X"], False),
    ],
)
def test_exact_matching(accepted, value, correct):
    check = check_answer(make_question(), make_key(accepted, MatchMode.EXACT), value)
    assert check.is_correct is correct


def test_exact_mode_never_reports_spelling():
    check = check_answer(make_question(), make_key(["colour"], MatchMode.EXACT), "colur")
    assert check == AnswerCheck(False, REASON_WRONG)


def test_unknown_match_mode_falls_back_to_the_text_pipeline():
    key = make_key(["colour"])
    key.match_mode = "something-new"
    assert check_answer(make_question(), key, "Colour.").is_correct


# ------------------------------------------------------------ word-limit rule


@pytest.mark.parametrize(
    ("question_limit", "group_limit", "expected"),
    [
        (2, None, (2, False)),
        (None, 3, (3, False)),
        (1, 3, (1, False)),  # the question overrides the group
        (None, None, (None, False)),
    ],
)
def test_resolve_word_limit(question_limit, group_limit, expected):
    group = make_group(word_limit=group_limit) if group_limit is not None else make_group()
    question = make_question(word_limit=question_limit, group=group)
    assert resolve_word_limit(question) == expected


def test_resolve_word_limit_without_a_group():
    assert resolve_word_limit(make_question()) == (None, False)


def test_question_allow_number_wins_when_the_question_sets_the_limit():
    group = make_group(word_limit=3, allow_number=False)
    question = make_question(word_limit=2, allow_number=True, group=group)
    assert resolve_word_limit(question) == (2, True)


def test_group_allow_number_applies_when_the_question_sets_no_limit():
    group = make_group(word_limit=2, allow_number=True)
    question = make_question(group=group)
    assert resolve_word_limit(question) == (2, True)


@pytest.mark.parametrize(
    ("limit", "allow_number", "value", "correct", "reason"),
    [
        # NO MORE THAN TWO WORDS
        (2, False, "coral reef", True, None),
        (2, False, "the coral reef", False, REASON_OVER_WORD_LIMIT),
        (2, False, "a large coral reef", False, REASON_OVER_WORD_LIMIT),
        # the right words, but too many of them: still wrong (real IELTS behaviour)
        (2, False, "it is coral reef", False, REASON_OVER_WORD_LIMIT),
        # ONE WORD ONLY
        (1, False, "colour", True, None),
        (1, False, "the colour", False, REASON_OVER_WORD_LIMIT),
        # a hyphenated compound is one word
        (1, False, "air-conditioning", True, None),
        (1, False, "air conditioning", False, REASON_OVER_WORD_LIMIT),
        # AND/OR A NUMBER: at most `limit` words AND at most ONE number
        (2, True, "20 December", True, None),
        (1, True, "20 December", True, None),
        (1, True, "20,000 tonnes", True, None),
        # a second numeral busts the limit even though the words still fit
        (2, True, "20 December 1999", False, REASON_OVER_WORD_LIMIT),
        (2, True, "on 20 December 1999", False, REASON_OVER_WORD_LIMIT),
        (2, True, "on the 20 December 1999", False, REASON_OVER_WORD_LIMIT),
        # and the words are still capped with a number in play
        (1, True, "20 large tonnes", False, REASON_OVER_WORD_LIMIT),
    ],
)
def test_word_limit_rule(limit, allow_number, value, correct, reason):
    accepted = [
        "coral reef",
        "the coral reef",
        "a large coral reef",
        "it is coral reef",
        "colour",
        "the colour",
        "air conditioning",
        "20 december",
        "20 december 1999",
        "on 20 december 1999",
        "on the 20 december 1999",
        "20,000 tonnes",
        "20 large tonnes",
    ]
    question = make_question(word_limit=limit, allow_number=allow_number)
    check = check_answer(question, make_key(accepted), value)
    assert check.is_correct is correct
    assert check.reason == reason


@pytest.mark.parametrize(
    ("value", "correct", "reason"),
    [
        # "NO MORE THAN TWO WORDS AND/OR A NUMBER" = two words and ONE number
        ("in 1999", True, None),  # one word + one numeral
        ("open in 1999", True, None),  # two words + one numeral
        ("20 December", True, None),
        ("20 December 1999", False, REASON_OVER_WORD_LIMIT),  # two numerals
        ("1999 2000", False, REASON_OVER_WORD_LIMIT),  # two numerals, no words
        ("until 20 December", True, None),
        ("opened again in 1999", False, REASON_OVER_WORD_LIMIT),  # three words
    ],
)
def test_one_number_allowance_is_exactly_one(value, correct, reason):
    """A numeral is free, but only one of them: this is what the real test marks."""
    accepted = [
        "in 1999",
        "open in 1999",
        "20 december",
        "20 december 1999",
        "1999 2000",
        "until 20 december",
        "opened again in 1999",
    ]
    question = make_question(word_limit=2, allow_number=True)
    check = check_answer(question, make_key(accepted), value)
    assert check.is_correct is correct
    assert check.reason == reason


def test_word_limit_comes_from_the_group_when_the_question_has_none():
    group = make_group(word_limit=2)
    question = make_question(group=group)
    check = check_answer(question, make_key(["a large coral reef"]), "a large coral reef")
    assert check == AnswerCheck(False, REASON_OVER_WORD_LIMIT)


def test_over_limit_beats_wrong_as_a_reason():
    question = make_question(word_limit=1)
    check = check_answer(question, make_key(["colour"]), "completely unrelated long answer")
    assert check == AnswerCheck(False, REASON_OVER_WORD_LIMIT)


def test_word_limit_does_not_apply_to_option_questions():
    question = make_question(QuestionType.MULTIPLE_CHOICE, word_limit=1)
    check = check_answer(question, make_key(["NOT GIVEN"], MatchMode.OPTION), "NOT GIVEN")
    assert check.is_correct


# -------------------------------------------------------------- spelling rule


@pytest.mark.parametrize(
    ("accepted", "value", "reason"),
    [
        (["accommodation"], "accomodation", REASON_SPELLING),
        (["government"], "goverment", REASON_SPELLING),
        (["colour"], "colur", REASON_SPELLING),
        (["coral reef"], "coral reaf", REASON_SPELLING),
        (["accommodation"], "acomodaton", REASON_WRONG),  # too far away
        (["whale"], "shark", REASON_WRONG),  # different first letter
        (["colour", "texture"], "textore", REASON_SPELLING),  # matches the second key entry
    ],
)
def test_spelling_near_miss_is_flagged_but_never_awarded(accepted, value, reason):
    check = check_answer(make_question(), make_key(accepted), value)
    assert check.is_correct is False
    assert check.reason == reason


def test_spelling_check_reports_the_intended_answer():
    check = check_answer(make_question(), make_key(["accommodation"]), "accomodation")
    assert check.matched == "accommodation"


def test_spelling_never_beats_the_word_limit():
    question = make_question(word_limit=1)
    check = check_answer(question, make_key(["accommodation"]), "the accomodation")
    assert check == AnswerCheck(False, REASON_OVER_WORD_LIMIT)


# ------------------------------------------------ every question type covered


@pytest.mark.parametrize("qtype", list(QuestionType))
def test_every_question_type_is_markable(qtype):
    """No QuestionType may fall through the engine unmarked."""
    if qtype == QuestionType.MULTIPLE_CHOICE_MULTI:
        key, value = make_key(["B", "D"], MatchMode.OPTION_SET), ["B", "D"]
    elif qtype in OPTION_TYPES:
        key, value = make_key(["B"], MatchMode.OPTION), "B"
    else:
        key, value = make_key(["coral reef"]), "coral reef"
    check = check_answer(make_question(qtype), key, value)
    assert check.is_correct is True
    assert check.reason is None
