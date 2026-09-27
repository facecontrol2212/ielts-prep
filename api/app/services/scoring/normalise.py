"""Text normalisation pipeline for IELTS answer checking (plan.md §6).

Every function here is **pure**: same input, same output, no I/O, no database.
Each one encodes a real marking rule, documented on the function itself.

The pipeline applied by :func:`normalise` is, in order:

1. unify unicode punctuation (curly quotes, dashes, non-breaking spaces)
2. trim + collapse internal whitespace, case-fold
3. strip surrounding punctuation and quotes from every token
4. hyphen/space tolerance (``air-conditioning`` == ``air conditioning``)
5. number <-> word equivalence (``5`` == ``five``, ``1990's`` == ``1990s``)
6. optional leading article (``a``/``an``/``the``) dropped when the key allows it

Word counting for the word-limit rule is deliberately **not** part of the
pipeline: IELTS counts the words the student actually wrote, before any of the
tidying above.
"""

from __future__ import annotations

import re

__all__ = [
    "ARTICLES",
    "canonicalise_numbers",
    "collapse_whitespace",
    "count_words",
    "count_words_for_limit",
    "drop_leading_article",
    "edit_distance",
    "is_near_miss",
    "is_number_token",
    "normalise",
    "split_hyphens",
    "strip_outer_punctuation",
    "unify_punctuation",
]


#: Articles IELTS lets a candidate add or omit when the key allows it.
ARTICLES: frozenset[str] = frozenset({"a", "an", "the"})

#: Characters that may legitimately surround an answer but carry no meaning.
_OUTER_PUNCTUATION = "\"'`.,;:!?()[]{}<>-_/\\ \t\n\r"

_UNIFY = {
    # single quotes / apostrophes
    ord("‘"): "'",
    ord("’"): "'",
    ord("‚"): "'",
    ord("‛"): "'",
    ord("´"): "'",
    ord("`"): "'",
    # double quotes
    ord("“"): '"',
    ord("”"): '"',
    ord("„"): '"',
    ord("‟"): '"',
    ord("«"): '"',
    ord("»"): '"',
    # dashes
    ord("‐"): "-",
    ord("‑"): "-",
    ord("‒"): "-",
    ord("–"): "-",
    ord("—"): "-",
    ord("―"): "-",
    ord("−"): "-",
    # spaces
    ord(" "): " ",
    ord(" "): " ",
    ord(" "): " ",
    ord(" "): " ",
    # ellipsis
    ord("…"): ".",
}

_WHITESPACE_RE = re.compile(r"\s+")

_INT_RE = re.compile(r"\d{1,3}(?:,\d{3})+|\d+")
_DECIMAL_RE = re.compile(r"\d+\.\d+")
_DECADE_RE = re.compile(r"(\d{2,4})'?s")
_ORDINAL_NUM_RE = re.compile(r"(\d+)(?:st|nd|rd|th)")
#: a numeral for the purposes of "AND/OR A NUMBER": digits plus an optional
#: decade/ordinal/clock suffix, e.g. 25, 20,000, 1990s, 21st, 6.30pm.
_NUMBER_TOKEN_RE = re.compile(r"[\d][\d,.:/]*(?:'?s|st|nd|rd|th|am|pm)?")

_CARDINAL_WORDS: dict[str, int] = {
    "zero": 0,
    "nought": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}

_TENS: dict[str, int] = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}

_UNITS_1_9: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
}

_ORDINAL_WORDS: dict[str, int] = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
    "thirtieth": 30,
    "fortieth": 40,
    "fiftieth": 50,
    "sixtieth": 60,
    "seventieth": 70,
    "eightieth": 80,
    "ninetieth": 90,
    "hundredth": 100,
}

_ORDINAL_UNITS_1_9: dict[str, int] = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
}

#: words that may precede "hundred": "one hundred", "a hundred"
_HUNDRED_PREFIX: dict[str, int] = {"a": 1, **_UNITS_1_9}

_HALF_SUFFIX: tuple[str, ...] = ("and", "a", "half")


# --------------------------------------------------------------------- basics


def unify_punctuation(text: str) -> str:
    """Fold typographic characters onto their ASCII equivalents.

    A candidate typing on a phone keyboard produces curly quotes and en-dashes;
    the answer key does not. Neither should cost a mark.
    """
    return text.translate(_UNIFY)


def collapse_whitespace(text: str) -> str:
    """Trim and collapse every run of whitespace to a single space (pipeline step 1)."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def strip_outer_punctuation(text: str) -> str:
    """Strip punctuation and quotes from both ends (pipeline step 2).

    A trailing full stop or a quoted answer is still the same answer; internal
    punctuation (``20,000``, ``1990's``, ``u.s.a``) is preserved.
    """
    return text.strip(_OUTER_PUNCTUATION)


def split_hyphens(text: str) -> str:
    """Treat a hyphen as a space (pipeline step 6 in plan.md §6).

    ``air-conditioning`` and ``air conditioning`` are the same answer.
    """
    return text.replace("-", " ")


def drop_leading_article(tokens: list[str]) -> list[str]:
    """Drop a leading ``a``/``an``/``the`` (pipeline step 3).

    Only applied when ``AnswerKey.allow_optional_article`` is set. An answer
    that is *nothing but* an article is left alone, otherwise it would normalise
    to the empty string and match a blank key.
    """
    if len(tokens) > 1 and tokens[0] in ARTICLES:
        return tokens[1:]
    return tokens


# -------------------------------------------------------------------- numbers


def _ordinal_suffix(n: int) -> str:
    """English ordinal suffix for ``n`` (11th/12th/13th are the exceptions)."""
    if n % 100 in (11, 12, 13):
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _ordinal(n: int) -> str:
    """Canonical ordinal numeral, e.g. ``21`` -> ``21st``."""
    return f"{n}{_ordinal_suffix(n)}"


def _format_decimal(raw: str) -> str:
    """``2.50`` -> ``2.5``; ``2.0`` -> ``2`` so it matches the integer form."""
    value = float(raw)
    return str(int(value)) if value.is_integer() else str(value)


def _match_number(tokens: list[str], i: int) -> tuple[int, str | None]:
    """Try to read a number starting at ``tokens[i]``.

    Returns ``(tokens_consumed, canonical_form)`` or ``(0, None)``. Canonical
    form is always the numeral spelling, so ``twenty-five``, ``twenty five``
    and ``25`` all collapse to ``25``.
    """
    token = tokens[i]
    nxt = tokens[i + 1] if i + 1 < len(tokens) else None

    if decade := _DECADE_RE.fullmatch(token):
        return 1, f"{decade.group(1)}s"
    if ordinal := _ORDINAL_NUM_RE.fullmatch(token):
        return 1, _ordinal(int(ordinal.group(1)))
    if _DECIMAL_RE.fullmatch(token):
        return 1, _format_decimal(token)
    if _INT_RE.fullmatch(token):
        return 1, str(int(token.replace(",", "")))

    if nxt is not None and token in _TENS and nxt in _UNITS_1_9:
        return 2, str(_TENS[token] + _UNITS_1_9[nxt])
    if nxt is not None and token in _TENS and nxt in _ORDINAL_UNITS_1_9:
        return 2, _ordinal(_TENS[token] + _ORDINAL_UNITS_1_9[nxt])
    if nxt == "hundred" and token in _HUNDRED_PREFIX:
        return 2, str(_HUNDRED_PREFIX[token] * 100)
    if token == "hundred":
        return 1, "100"
    if token in _CARDINAL_WORDS:
        return 1, str(_CARDINAL_WORDS[token])
    if token in _ORDINAL_WORDS:
        return 1, _ordinal(_ORDINAL_WORDS[token])
    return 0, None


def canonicalise_numbers(tokens: list[str]) -> list[str]:
    """Rewrite number words as numerals (pipeline step 4 in plan.md §6).

    Covers 0-100 written out (including ``twenty five`` / ``twenty-five``),
    ordinals in both spellings (``third`` == ``3rd``), decades (``1990s`` ==
    ``1990's``), thousands separators (``20,000`` == ``20000``) and the
    ``... and a half`` form (``two and a half`` == ``2.5``).
    """
    out: list[str] = []
    i = 0
    while i < len(tokens):
        consumed, canonical = _match_number(tokens, i)
        if consumed and canonical is not None:
            tail = tuple(tokens[i + consumed : i + consumed + 3])
            if tail == _HALF_SUFFIX and canonical.isdigit():
                canonical = f"{canonical}.5"
                consumed += 3
            out.append(canonical)
            i += consumed
        else:
            out.append(tokens[i])
            i += 1
    return out


def is_number_token(token: str) -> bool:
    """True when the token is a numeral, e.g. ``25``, ``20,000``, ``1990s``, ``21st``.

    Used by the "AND/OR A NUMBER" half of a word limit. A number *written out*
    ("twenty five") is deliberately not covered: IELTS counts those as words.
    """
    return bool(_NUMBER_TOKEN_RE.fullmatch(token))


# ------------------------------------------------------------- word counting


def count_words(text: str) -> int:
    """Count words the way IELTS does.

    - a hyphenated compound is **one** word (``air-conditioning``)
    - a number with a separator is **one** word (``20,000``)
    - a contraction is **one** word (``don't``)
    - stray punctuation on its own is not a word
    """
    cleaned = collapse_whitespace(unify_punctuation(text))
    return sum(1 for token in cleaned.split(" ") if any(ch.isalnum() for ch in token))


def count_words_for_limit(text: str, *, allow_number: bool = False) -> int:
    """Words counted against an instruction's word limit.

    When the instruction reads "... AND/OR A NUMBER" (``allow_number``), a
    numeral is free: "NO MORE THAN TWO WORDS AND/OR A NUMBER" accepts
    ``20 December 1999``-style answers without the digits eating the budget.
    """
    cleaned = collapse_whitespace(unify_punctuation(text))
    count = 0
    for token in cleaned.split(" "):
        if not any(ch.isalnum() for ch in token):
            continue
        stripped = strip_outer_punctuation(token)
        if allow_number and is_number_token(stripped):
            continue
        count += 1
    return count


# ---------------------------------------------------------------- comparison


def normalise(text: str, *, drop_article: bool = False) -> str:
    """Run the whole pipeline and return the canonical form of an answer."""
    stage = collapse_whitespace(unify_punctuation(str(text))).casefold()
    stage = " ".join(strip_outer_punctuation(tok) for tok in stage.split(" "))
    stage = collapse_whitespace(split_hyphens(stage))
    tokens = [tok for tok in stage.split(" ") if tok]
    tokens = canonicalise_numbers(tokens)
    if drop_article:
        tokens = drop_leading_article(tokens)
    return " ".join(tokens)


def edit_distance(a: str, b: str) -> int:
    """Levenshtein distance between two strings."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (ca != cb),
                )
            )
        previous = current
    return previous[-1]


#: shortest accepted answer we are willing to call a "near miss". Below this a
#: one-character difference is much more likely a different word than a typo.
MIN_NEAR_MISS_LENGTH = 4


def is_near_miss(student: str, accepted: str) -> bool:
    """True when a wrong answer looks like a spelling slip of an accepted one.

    IELTS never awards the mark for a misspelling (plan.md §6 step 8), but the
    review screen wants to say "spelling cost you the mark", so we flag answers
    within edit distance 1 that start with the same letter.
    """
    if not student or not accepted:
        return False
    if len(accepted) < MIN_NEAR_MISS_LENGTH or len(student) < MIN_NEAR_MISS_LENGTH:
        return False
    if student[0] != accepted[0]:
        return False
    return edit_distance(student, accepted) == 1
