"""Marking a single answer against its key (plan.md §6).

``check_answer`` is pure with respect to the database: it reads the question,
its group (for a shared word limit) and the key, and returns an
:class:`~app.services.scoring.AnswerCheck`. It never writes anything.

Marking order, which matters:

1. blank                -> wrong, ``reason="blank"``
2. over the word limit  -> wrong, ``reason="over_word_limit"`` *even if the
   right words are in there*. This is real IELTS behaviour.
3. matched              -> correct
4. one typo away        -> wrong, ``reason="spelling"`` (never a mark, but the
   review screen can say "spelling cost you the mark")
5. otherwise            -> wrong, ``reason="wrong"``
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.models.enums import MatchMode, QuestionType
from app.services.scoring import AnswerCheck
from app.services.scoring.normalise import count_words_for_limit, is_near_miss, normalise

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.models.test import AnswerKey, Question

__all__ = ["check_answer", "resolve_word_limit"]

REASON_BLANK = "blank"
REASON_WRONG = "wrong"
REASON_SPELLING = "spelling"
REASON_OVER_WORD_LIMIT = "over_word_limit"

#: Accepted spellings of a True/False/Not Given verdict, mapped to one label.
_TFNG_ALIASES: dict[str, str] = {
    "t": "true",
    "true": "true",
    "f": "false",
    "false": "false",
    "ng": "not given",
    "n/g": "not given",
    "notgiven": "not given",
    "not_given": "not given",
    "not given": "not given",
}

#: Same for Yes/No/Not Given. "n" means "no" here, which is why the two tables
#: are kept apart instead of merged.
_YNNG_ALIASES: dict[str, str] = {
    "y": "yes",
    "yes": "yes",
    "n": "no",
    "no": "no",
    "ng": "not given",
    "n/g": "not given",
    "notgiven": "not given",
    "not_given": "not given",
    "not given": "not given",
}

_ALIAS_TABLES: dict[QuestionType, dict[str, str]] = {
    QuestionType.TRUE_FALSE_NOT_GIVEN: _TFNG_ALIASES,
    QuestionType.YES_NO_NOT_GIVEN: _YNNG_ALIASES,
}


# ------------------------------------------------------------------- helpers


def resolve_word_limit(question: Question) -> tuple[int | None, bool]:
    """Effective ``(word_limit, allow_number)`` for a question.

    A question-level limit overrides the group-level one; when the question
    sets no limit the group's instruction ("NO MORE THAN TWO WORDS AND/OR A
    NUMBER") applies to every question in the group.
    """
    if question.word_limit is not None:
        return question.word_limit, bool(question.allow_number)
    group = getattr(question, "group", None)
    if group is not None and group.word_limit is not None:
        return group.word_limit, bool(group.allow_number)
    return None, bool(question.allow_number)


def is_blank(value: Any) -> bool:
    """A missing, empty or whitespace-only answer. Counts as wrong, not as a typo."""
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, list | tuple | set):
        return len(value) == 0 or all(is_blank(item) for item in value)
    return False


def as_text(value: Any) -> str | None:
    """Coerce a submitted value to a single string, or ``None`` if it cannot be.

    The exam runner sometimes posts ``["colour"]`` where a string was expected;
    a one-element list is the same answer. A longer list is not, and is wrong.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, list | tuple):
        return as_text(value[0]) if len(value) == 1 else None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return str(value)
    return None


def as_labels(value: Any) -> list[str]:
    """Coerce a submitted value to a list of option labels.

    A bare string is accepted where a list was expected; ``"B, D"`` is split on
    commas so a free-text client cannot silently lose a selection.
    """
    if isinstance(value, str):
        parts = value.split(",") if "," in value else [value]
        return [p.strip() for p in parts if p.strip()]
    if isinstance(value, list | tuple | set):
        out: list[str] = []
        for item in value:
            out.extend(as_labels(item))
        return out
    if value is None:
        return []
    return [str(value).strip()]


def canonical_label(raw: str, question_type: QuestionType) -> str:
    """Case-insensitive, trimmed option label, with TRUE/FALSE/NG spellings folded.

    ``"t"``, ``"True"`` and ``"TRUE"`` are the same verdict; so are ``"ng"``,
    ``"Not Given"`` and ``"not_given"``.
    """
    label = " ".join(raw.split()).casefold()
    aliases = _ALIAS_TABLES.get(question_type)
    if aliases is not None:
        return aliases.get(label, label)
    return label


def _accepted_forms(key: AnswerKey, *, drop_article: bool) -> list[tuple[str, str]]:
    """``(normalised, original)`` for every accepted answer, blanks removed."""
    forms: list[tuple[str, str]] = []
    for accepted in key.accepted or []:
        text = as_text(accepted)
        if text is None or not text.strip():
            continue
        forms.append((normalise(text, drop_article=drop_article), text))
    return forms


# ------------------------------------------------------------------ matchers


def _check_option(question: Question, key: AnswerKey, value: Any) -> AnswerCheck:
    """Single labelled option: multiple choice, matching, TRUE/FALSE/NOT GIVEN."""
    text = as_text(value)
    if text is None:
        return AnswerCheck(False, REASON_WRONG)
    student = canonical_label(text, question.type)
    for accepted in key.accepted or []:
        accepted_text = as_text(accepted)
        if accepted_text is None:
            continue
        if student == canonical_label(accepted_text, question.type):
            return AnswerCheck(True, None, accepted_text)
    return AnswerCheck(False, REASON_WRONG)


def _check_option_set(question: Question, key: AnswerKey, value: Any) -> AnswerCheck:
    """Multi-answer question: unordered set equality, no partial credit.

    One question number is one mark, so a missing *or* an extra selection makes
    the whole answer wrong.
    """
    student = {canonical_label(label, question.type) for label in as_labels(value)}
    expected = {
        canonical_label(text, question.type)
        for text in (as_text(a) for a in key.accepted or [])
        if text is not None
    }
    if not expected:
        return AnswerCheck(False, REASON_WRONG)
    if student == expected:
        return AnswerCheck(True, None, ", ".join(sorted(str(a) for a in key.accepted)))
    return AnswerCheck(False, REASON_WRONG)


def _check_text(question: Question, key: AnswerKey, value: Any) -> AnswerCheck:
    """Free-text answer: word limit first, then the normalisation pipeline."""
    text = as_text(value)
    if text is None:
        return AnswerCheck(False, REASON_WRONG)

    word_limit, allow_number = resolve_word_limit(question)
    if word_limit is not None:
        used = count_words_for_limit(text, allow_number=allow_number)
        if used > word_limit:
            return AnswerCheck(False, REASON_OVER_WORD_LIMIT)

    exact_only = key.match_mode == MatchMode.EXACT
    if exact_only:
        student = " ".join(text.split()).casefold()
        for accepted in key.accepted or []:
            accepted_text = as_text(accepted)
            if accepted_text is None:
                continue
            if student == " ".join(accepted_text.split()).casefold():
                return AnswerCheck(True, None, accepted_text)
        return AnswerCheck(False, REASON_WRONG)

    drop_article = bool(key.allow_optional_article)
    student = normalise(text, drop_article=drop_article)
    forms = _accepted_forms(key, drop_article=drop_article)
    for normalised, original in forms:
        if student and student == normalised:
            return AnswerCheck(True, None, original)
    for normalised, original in forms:
        if is_near_miss(student, normalised):
            return AnswerCheck(False, REASON_SPELLING, original)
    return AnswerCheck(False, REASON_WRONG)


_MATCHERS = {
    MatchMode.OPTION: _check_option,
    MatchMode.OPTION_SET: _check_option_set,
    MatchMode.NORMALISED: _check_text,
    MatchMode.EXACT: _check_text,
}


def check_answer(question: Question, key: AnswerKey, value: Any) -> AnswerCheck:
    """Mark a single answer against its key. See the module docstring for the order."""
    if is_blank(value):
        return AnswerCheck(False, REASON_BLANK)
    # StrEnum members hash as their string value, so a raw DB string matches too.
    # An unknown mode falls back to the text pipeline rather than failing a whole attempt.
    matcher = _MATCHERS.get(key.match_mode, _check_text)
    return matcher(question, key, value)
