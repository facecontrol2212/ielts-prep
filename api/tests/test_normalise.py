"""Table-driven tests for the normalisation pipeline (plan.md §6).

One table per rule. Every row is a real thing a candidate might type.
"""

import pytest

from app.services.scoring.normalise import (
    MIN_NEAR_MISS_LENGTH,
    canonicalise_numbers,
    collapse_whitespace,
    count_number_tokens,
    count_words,
    count_words_for_limit,
    drop_leading_article,
    edit_distance,
    exceeds_word_limit,
    is_near_miss,
    is_number_token,
    normalise,
    split_hyphens,
    strip_outer_punctuation,
    unify_punctuation,
)

# ------------------------------------------------------- step 1: whitespace


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  the   Great  Barrier  ", "the Great Barrier"),
        ("coral\treef", "coral reef"),
        ("coral\n\nreef", "coral reef"),
        ("   ", ""),
        ("", ""),
        ("already tidy", "already tidy"),
    ],
)
def test_collapse_whitespace(raw, expected):
    assert collapse_whitespace(raw) == expected


def test_non_breaking_space_is_a_space():
    assert normalise("coral reef") == "coral reef"


# ----------------------------------------------- step 2: unicode punctuation


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("‘quoted’", "'quoted'"),
        ("“quoted”", '"quoted"'),
        ("«quoted»", '"quoted"'),
        ("air–conditioning", "air-conditioning"),
        ("air—conditioning", "air-conditioning"),
        ("minus−one", "minus-one"),
        ("and so on…", "and so on."),
    ],
)
def test_unify_punctuation(raw, expected):
    assert unify_punctuation(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("museum.", "museum"),
        ('"museum"', "museum"),
        ("'museum'", "museum"),
        ("(museum)", "museum"),
        ("museum!?", "museum"),
        ("-museum-", "museum"),
        ("20,000", "20,000"),
        ("u.s.a.", "u.s.a"),
        ("....", ""),
    ],
)
def test_strip_outer_punctuation(raw, expected):
    assert strip_outer_punctuation(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "“the Great Barrier Reef.”",
        "  the great barrier reef!  ",
        "‘The Great Barrier Reef’",
        "the Great Barrier Reef",
    ],
)
def test_adversarial_punctuation_all_normalise_the_same(raw):
    assert normalise(raw) == "the great barrier reef"


# ------------------------------------------------------------ step 3: article


@pytest.mark.parametrize(
    ("tokens", "expected"),
    [
        (["the", "museum"], ["museum"]),
        (["a", "museum"], ["museum"]),
        (["an", "orange"], ["orange"]),
        (["museum"], ["museum"]),
        (["the"], ["the"]),  # an answer that is only an article keeps it
        ([], []),
    ],
)
def test_drop_leading_article(tokens, expected):
    assert drop_leading_article(tokens) == expected


@pytest.mark.parametrize(
    ("raw", "with_article", "without_article"),
    [
        ("the museum", "the museum", "museum"),
        ("a bicycle", "a bicycle", "bicycle"),
        ("museum", "museum", "museum"),
    ],
)
def test_normalise_optional_article(raw, with_article, without_article):
    assert normalise(raw) == with_article
    assert normalise(raw, drop_article=True) == without_article


# ------------------------------------------------------------ step 4: numbers


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # cardinals, both directions
        ("five", "5"),
        ("5", "5"),
        ("zero", "0"),
        ("nought", "0"),
        ("nineteen", "19"),
        ("twenty", "20"),
        ("twenty five", "25"),
        ("twenty-five", "25"),
        ("25", "25"),
        ("ninety nine", "99"),
        ("one hundred", "100"),
        ("a hundred", "100"),
        ("hundred", "100"),
        ("two hundred", "200"),
        # thousands separator
        ("20,000", "20000"),
        ("20000", "20000"),
        # decades
        ("1990s", "1990s"),
        ("1990's", "1990s"),
        ("1990", "1990"),
        # ordinals, both directions
        ("first", "1st"),
        ("1st", "1st"),
        ("third", "3rd"),
        ("3rd", "3rd"),
        ("second", "2nd"),
        ("eleventh", "11th"),
        ("twelfth", "12th"),
        ("thirteenth", "13th"),
        ("twentieth", "20th"),
        ("twenty first", "21st"),
        ("twenty-second", "22nd"),
        ("twenty third", "23rd"),
        ("hundredth", "100th"),
        ("21ST", "21st"),
        # decimals and halves
        ("2.5", "2.5"),
        ("2.50", "2.5"),
        ("2.0", "2"),
        ("two and a half", "2.5"),
        ("2 and a half", "2.5"),
        ("twenty five and a half", "25.5"),
        # "and a half" after something that is not a whole number is left alone
        ("third and a half", "3rd and a half"),
        ("1990s and a half", "1990s and a half"),
        # inside a phrase
        ("twenty five dollars", "25 dollars"),
        ("in the 1990s", "in the 1990s"),
        # not numbers
        ("reef", "reef"),
        ("one of the reefs", "1 of the reefs"),
    ],
)
def test_number_word_equivalence(raw, expected):
    assert normalise(raw) == expected


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ("25", "twenty five"),
        ("25", "twenty-five"),
        ("twenty five", "twenty-five"),
        ("1990s", "1990's"),
        ("2.5", "two and a half"),
        ("3rd", "third"),
        ("20,000", "20000"),
    ],
)
def test_number_forms_are_interchangeable(left, right):
    assert normalise(left) == normalise(right)


def test_canonicalise_numbers_is_pure():
    tokens = ["twenty", "five"]
    assert canonicalise_numbers(tokens) == ["25"]
    assert tokens == ["twenty", "five"]


# ------------------------------------------------------- step 6: hyphen/space


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("air-conditioning", "air conditioning"),
        ("well-known", "well known"),
        ("nothing to split", "nothing to split"),
    ],
)
def test_split_hyphens(raw, expected):
    assert split_hyphens(raw) == expected


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ("air-conditioning", "air conditioning"),
        ("AIR-CONDITIONING", "air conditioning"),
        ("air–conditioning", "air conditioning"),
    ],
)
def test_hyphen_space_tolerance(left, right):
    assert normalise(left) == normalise(right)


# --------------------------------------------------------------- word counting


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("air-conditioning", 1),  # hyphenated compound = one word
        ("20,000", 1),  # a number with a separator = one word
        ("don't", 1),  # a contraction = one word
        ("the Great Barrier Reef", 4),
        ("  spaced   out  ", 2),
        ("", 0),
        ("   ", 0),
        ("- -", 0),  # stray punctuation is not a word
        ("a well-known air-conditioning unit", 4),
        ("20 December 1999", 3),
    ],
)
def test_count_words(raw, expected):
    assert count_words(raw) == expected


@pytest.mark.parametrize(
    ("raw", "allow_number", "expected"),
    [
        ("two words", False, 2),
        ("20 December", False, 2),
        ("20 December", True, 1),  # the numeral is counted separately
        ("20,000 tonnes", True, 1),
        ("1990s music", True, 1),
        ("21st century", True, 1),
        ("6.30pm start", True, 1),
        ("twenty five dollars", True, 3),  # numbers written out still count
        ("- 25", True, 0),
        ("25", False, 1),
    ],
)
def test_count_words_for_limit(raw, allow_number, expected):
    assert count_words_for_limit(raw, allow_number=allow_number) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", 0),
        ("no numbers here", 0),
        ("20 December", 1),
        ("20 December 1999", 2),
        ("1999 2000", 2),
        ("20,000 tonnes", 1),
        ("twenty five", 0),  # written out, so they are words not numerals
        ("- 25", 1),
    ],
)
def test_count_number_tokens(raw, expected):
    assert count_number_tokens(raw) == expected


@pytest.mark.parametrize(
    ("raw", "limit", "allow_number", "expected"),
    [
        # NO MORE THAN TWO WORDS
        ("coral reef", 2, False, False),
        ("the coral reef", 2, False, True),
        ("20 December", 2, False, False),  # the numeral is a word here
        ("20 December 1999", 2, False, True),
        ("air-conditioning unit", 2, False, False),
        # NO MORE THAN TWO WORDS AND/OR A NUMBER: two words and ONE number
        ("open in 1999", 2, True, False),
        ("opened again in 1999", 2, True, True),  # three words
        ("20 December", 2, True, False),
        ("20 December 1999", 2, True, True),  # two numerals
        ("1999 2000", 2, True, True),
        ("20,000", 1, True, False),
        ("20,000 30,000", 1, True, True),
        ("", 1, True, False),
    ],
)
def test_exceeds_word_limit(raw, limit, allow_number, expected):
    assert exceeds_word_limit(raw, limit, allow_number=allow_number) is expected


@pytest.mark.parametrize(
    ("token", "expected"),
    [
        ("25", True),
        ("20,000", True),
        ("1990s", True),
        ("1990's", True),
        ("21st", True),
        ("6.30pm", True),
        ("12:30", True),
        ("reef", False),
        ("twenty", False),
        ("", False),
    ],
)
def test_is_number_token(token, expected):
    assert is_number_token(token) is expected


# ------------------------------------------------------------ spelling checks


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("reef", "reef", 0),
        ("reef", "reaf", 1),
        ("reef", "ref", 1),
        ("reef", "reefs", 1),
        ("", "reef", 4),
        ("reef", "", 4),
        ("", "", 0),
        ("kitten", "sitting", 3),
    ],
)
def test_edit_distance(a, b, expected):
    assert edit_distance(a, b) == expected


@pytest.mark.parametrize(
    ("student", "accepted", "expected"),
    [
        ("accomodation", "accommodation", True),  # the classic IELTS misspelling
        ("goverment", "government", True),
        ("colour", "colours", True),
        ("colour", "color", True),
        ("reef", "reef", False),  # identical is not a near miss
        ("whale", "shark", False),  # different first letter
        ("cat", "car", False),  # too short to be sure it is a typo
        ("reef", "car", False),
        ("", "reef", False),
        ("reef", "", False),
        ("accomodaton", "accommodation", False),  # two typos: just wrong
    ],
)
def test_is_near_miss(student, accepted, expected):
    assert is_near_miss(student, accepted) is expected


def test_min_near_miss_length_is_documented():
    assert MIN_NEAR_MISS_LENGTH == 4


# --------------------------------------------------------------- purity check


@pytest.mark.parametrize(
    "raw",
    ["  the   Great  Barrier  ", "twenty-five", "1990's", "", "colour."],
)
def test_normalise_is_idempotent_and_pure(raw):
    once = normalise(raw)
    assert normalise(once) == once
