"""The content authoring format.

One JSON file per document, version-controlled under ``content/``. These pydantic models
are the *single* definition of what a valid document looks like: the CLI importer, the
admin import endpoint and the test suite all validate through them, so a file that imports
from the command line imports identically through the API.

See ``docs/content-authoring.md`` for the prose version.

Design rule: **every validation error names the offending question number.** A content
author must be able to find the mistake in seconds, so errors read like
``Q17: accepted answer 'B' is not in the option pool (A, C, D)``.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    OPTION_ANSWER_TYPES,
    MatchMode,
    QuestionType,
    Skill,
    SpeakingPart,
    Variant,
)
from app.schemas.common import ORMModel

__all__ = [
    "AnswerKeyDoc",
    "ContentDocument",
    "ContentValidationError",
    "GroupDoc",
    "OptionDoc",
    "QuestionDoc",
    "SectionDoc",
    "SpeakingBankDocument",
    "SpeakingQuestionDoc",
    "SpeakingQuestionOut",
    "TestDocument",
    "UsefulPhraseDoc",
    "WritingPromptDoc",
    "WritingPromptSetDocument",
    "default_match_mode",
    "default_options",
    "load_document",
    "parse_document",
]


# --------------------------------------------------------------------------- helpers

#: Types that are answered by selecting several labels at once.
MULTI_OPTION_TYPES = frozenset({QuestionType.MULTIPLE_CHOICE_MULTI})

_DEFAULT_OPTION_POOLS: dict[QuestionType, list[tuple[str, str]]] = {
    QuestionType.TRUE_FALSE_NOT_GIVEN: [
        ("TRUE", "True"),
        ("FALSE", "False"),
        ("NOT GIVEN", "Not Given"),
    ],
    QuestionType.YES_NO_NOT_GIVEN: [
        ("YES", "Yes"),
        ("NO", "No"),
        ("NOT GIVEN", "Not Given"),
    ],
}

_NUMBERISH = re.compile(
    r"^[£$€]?\d[\d,.:/-]*(?:%|st|nd|rd|th|am|pm|km|kg|cm|mm|ml|m|g|k|c|f)?$",
    re.IGNORECASE,
)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def default_options(qtype: QuestionType) -> list[dict[str, str]] | None:
    """The implicit option pool for types that always have the same one (TFNG, YNNG)."""
    pool = _DEFAULT_OPTION_POOLS.get(qtype)
    if pool is None:
        return None
    return [{"label": label, "text": text} for label, text in pool]


def default_match_mode(qtype: QuestionType) -> MatchMode:
    """The match mode implied by a question type when the author does not state one."""
    if qtype in MULTI_OPTION_TYPES:
        return MatchMode.OPTION_SET
    if qtype in OPTION_ANSWER_TYPES:
        return MatchMode.OPTION
    return MatchMode.NORMALISED


def _allowed_match_modes(qtype: QuestionType) -> set[MatchMode]:
    if qtype in MULTI_OPTION_TYPES:
        return {MatchMode.OPTION_SET}
    if qtype in OPTION_ANSWER_TYPES:
        return {MatchMode.OPTION}
    return {MatchMode.NORMALISED, MatchMode.EXACT}


def strip_html(value: str) -> str:
    """Flatten HTML to comparable plain text (used by the evidence check)."""
    return _WS.sub(" ", _TAG.sub(" ", value)).strip()


def count_words(value: str) -> tuple[int, int]:
    """Return ``(words, numbers)`` the way IELTS counts them.

    A hyphenated compound is one word; a bare numeral is a number, not a word.
    """
    words = 0
    numbers = 0
    for token in value.split():
        bare = token.strip("\"'“”‘’.,;:!?()[]")
        if not bare:
            continue
        if _NUMBERISH.match(bare):
            numbers += 1
        else:
            words += 1
    return words, numbers


class ContentValidationError(ValueError):
    """Raised by :func:`parse_document` with one human-readable message per problem."""

    def __init__(self, problems: list[str], source: str | None = None) -> None:
        self.problems = problems
        self.source = source
        head = f"{source}: " if source else ""
        super().__init__(head + f"{len(problems)} problem(s)\n  - " + "\n  - ".join(problems))


class AuthoringModel(BaseModel):
    """Unknown keys are rejected: a typo in a field name is a content bug, not a comment."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --------------------------------------------------------------------------- test doc


class OptionDoc(AuthoringModel):
    label: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1)


class AnswerKeyDoc(AuthoringModel):
    """The correct answer. Never leaves the server for a student."""

    #: every acceptable form, e.g. ``["colour", "color"]`` or ``["A"]`` or ``["B", "D"]``
    accepted: list[str] = Field(min_length=1)
    #: omit and it is inferred from the question type
    match_mode: MatchMode | None = None
    allow_optional_article: bool = True
    explanation: str | None = None

    @model_validator(mode="after")
    def _non_empty(self) -> AnswerKeyDoc:
        if any(not a.strip() for a in self.accepted):
            raise ValueError("accepted answers must not be blank")
        return self


class QuestionDoc(AuthoringModel):
    number: int = Field(ge=1, le=40)
    #: defaults to the group's type
    type: QuestionType | None = None
    prompt: str = ""
    #: overrides the group option pool for this question only
    options: list[OptionDoc] | None = None
    word_limit: int | None = Field(default=None, ge=1, le=10)
    allow_number: bool | None = None
    #: the exact sentence from the passage/transcript that proves the answer
    evidence: str | None = None
    #: seconds into the section audio (listening only)
    audio_timestamp: int | None = Field(default=None, ge=0)
    answer: AnswerKeyDoc

    def resolved_type(self, group: GroupDoc) -> QuestionType:
        return self.type or group.type

    def resolved_options(self, group: GroupDoc) -> list[OptionDoc] | None:
        if self.options is not None:
            return self.options
        if group.options is not None:
            return group.options
        defaults = default_options(self.resolved_type(group))
        if defaults is None:
            return None
        return [OptionDoc(**o) for o in defaults]

    def resolved_word_limit(self, group: GroupDoc) -> int | None:
        return self.word_limit if self.word_limit is not None else group.word_limit

    def resolved_allow_number(self, group: GroupDoc) -> bool:
        if self.allow_number is not None:
            return self.allow_number
        return group.allow_number

    def resolved_match_mode(self, group: GroupDoc) -> MatchMode:
        return self.answer.match_mode or default_match_mode(self.resolved_type(group))


class GroupDoc(AuthoringModel):
    """Consecutive questions sharing instructions, a word limit and an option pool."""

    order: int = Field(default=1, ge=1)
    type: QuestionType
    instructions: str = Field(min_length=1)
    word_limit: int | None = Field(default=None, ge=1, le=10)
    allow_number: bool = False
    #: shared option pool, e.g. the list of headings
    options: list[OptionDoc] | None = None
    #: for multi-answer groups: how many options must be selected
    select_count: int | None = Field(default=None, ge=2)
    #: the summary paragraph / table / note skeleton the gaps sit in
    content_html: str | None = None
    image_url: str | None = None
    questions: list[QuestionDoc] = Field(min_length=1)

    @property
    def number_range(self) -> str:
        numbers = [q.number for q in self.questions]
        lo, hi = min(numbers), max(numbers)
        return f"Q{lo}" if lo == hi else f"Q{lo}-{hi}"

    @model_validator(mode="after")
    def _validate_group(self) -> GroupDoc:
        problems: list[str] = []
        self._check_option_pool(problems)
        self._check_word_limit_declared(problems)
        for q in self.questions:
            self._check_question(q, problems)
        if problems:
            raise ValueError("\n".join(problems))
        return self

    # -- rules ------------------------------------------------------------

    def _check_option_pool(self, problems: list[str]) -> None:
        if self.options is None:
            return
        seen: set[str] = set()
        for opt in self.options:
            if opt.label in seen:
                problems.append(
                    f"{self.number_range}: option label '{opt.label}' appears twice "
                    f"in the group option pool"
                )
            seen.add(opt.label)

    def _check_word_limit_declared(self, problems: list[str]) -> None:
        """Rule: 'NO MORE THAN ...' in the instructions means a machine-readable limit."""
        if "NO MORE THAN" not in self.instructions.upper():
            return
        if self.word_limit is not None:
            return
        missing = [q.number for q in self.questions if q.word_limit is None]
        if missing:
            listed = ", ".join(f"Q{n}" for n in missing)
            problems.append(
                f"{self.number_range}: instructions say 'NO MORE THAN' but no word_limit is "
                f"set on the group and these questions do not set one either: {listed}"
            )

    def _check_question(self, q: QuestionDoc, problems: list[str]) -> None:
        qtype = q.resolved_type(self)
        mode = q.resolved_match_mode(self)
        accepted = q.answer.accepted

        allowed = _allowed_match_modes(qtype)
        if mode not in allowed:
            names = ", ".join(sorted(m.value for m in allowed))
            problems.append(
                f"Q{q.number}: match_mode '{mode.value}' is not valid for question type "
                f"'{qtype.value}' (allowed: {names})"
            )

        if qtype in MULTI_OPTION_TYPES:
            self._check_multi_option(q, accepted, problems)
        elif qtype in OPTION_ANSWER_TYPES:
            self._check_single_option(q, qtype, accepted, problems)
        else:
            self._check_text(q, accepted, problems)

    def _option_labels(self, q: QuestionDoc) -> list[str] | None:
        options = q.resolved_options(self)
        if options is None:
            return None
        return [o.label for o in options]

    def _check_single_option(
        self, q: QuestionDoc, qtype: QuestionType, accepted: list[str], problems: list[str]
    ) -> None:
        if len(accepted) != 1:
            problems.append(
                f"Q{q.number}: '{qtype.value}' takes exactly one accepted label, "
                f"got {len(accepted)} ({', '.join(accepted)})"
            )
        labels = self._option_labels(q)
        if labels is None:
            problems.append(
                f"Q{q.number}: question type '{qtype.value}' needs an option pool — "
                f"set 'options' on the group or on the question"
            )
            return
        for a in accepted:
            if a not in labels:
                problems.append(
                    f"Q{q.number}: accepted answer '{a}' is not in the option pool "
                    f"({', '.join(labels)})"
                )
        if q.resolved_word_limit(self) is not None:
            problems.append(
                f"Q{q.number}: word_limit makes no sense on '{qtype.value}' — "
                f"the answer is an option label"
            )

    def _check_multi_option(self, q: QuestionDoc, accepted: list[str], problems: list[str]) -> None:
        if self.select_count is None:
            problems.append(
                f"Q{q.number}: 'multiple_choice_multi' requires select_count on the group"
            )
        elif len(accepted) != self.select_count:
            problems.append(
                f"Q{q.number}: select_count is {self.select_count} but the answer key lists "
                f"{len(accepted)} labels ({', '.join(accepted)})"
            )
        if len(set(accepted)) != len(accepted):
            problems.append(f"Q{q.number}: the answer key repeats a label ({', '.join(accepted)})")
        labels = self._option_labels(q)
        if labels is None:
            problems.append(f"Q{q.number}: 'multiple_choice_multi' needs an option pool")
            return
        for a in accepted:
            if a not in labels:
                problems.append(
                    f"Q{q.number}: accepted answer '{a}' is not in the option pool "
                    f"({', '.join(labels)})"
                )

    def _check_text(self, q: QuestionDoc, accepted: list[str], problems: list[str]) -> None:
        limit = q.resolved_word_limit(self)
        if limit is None:
            return
        allow_number = q.resolved_allow_number(self)
        for a in accepted:
            words, numbers = count_words(a)
            # "TWO WORDS AND/OR A NUMBER" = up to two words plus one number; with no
            # number allowed, a numeral simply counts against the word budget.
            over = (words > limit or numbers > 1) if allow_number else (words + numbers) > limit
            if over:
                problems.append(
                    f"Q{q.number}: accepted answer '{a}' is {words} word(s) and "
                    f"{numbers} number(s), over the limit of {limit} word(s)"
                    + (" and/or a number" if allow_number else "")
                    + " — it could never be marked correct"
                )


class SectionDoc(AuthoringModel):
    """A reading passage, a listening section, or a writing task."""

    order: int = Field(ge=1, le=9)
    title: str = Field(min_length=1, max_length=200)
    instructions: str | None = None

    # reading
    passage_html: str | None = None
    # listening
    audio_url: str | None = None
    transcript: str | None = None
    # writing
    prompt_html: str | None = None
    image_url: str | None = None
    #: what the chart/diagram actually shows, in words. The AI grader never sees the image,
    #: and a screen reader has nothing else to read out.
    image_description: str | None = None
    min_words: int | None = Field(default=None, ge=1)

    start_question: int | None = Field(default=None, ge=1)
    end_question: int | None = Field(default=None, ge=1)

    groups: list[GroupDoc] = Field(default_factory=list)

    @property
    def questions(self) -> list[QuestionDoc]:
        return [q for g in self.groups for q in g.questions]

    @model_validator(mode="after")
    def _validate_section(self) -> SectionDoc:
        problems: list[str] = []
        orders = [g.order for g in self.groups]
        if len(set(orders)) != len(orders):
            problems.append(f"section {self.order}: two question groups share the same 'order'")

        numbers = [q.number for q in self.questions]
        if numbers:
            lo, hi = min(numbers), max(numbers)
            if self.start_question is not None and self.start_question != lo:
                problems.append(
                    f"section {self.order}: start_question is {self.start_question} but the "
                    f"first question in the section is Q{lo}"
                )
            if self.end_question is not None and self.end_question != hi:
                problems.append(
                    f"section {self.order}: end_question is {self.end_question} but the "
                    f"last question in the section is Q{hi}"
                )
        if problems:
            raise ValueError("\n".join(problems))
        return self

    def reference_text(self) -> str:
        """Plain text an ``evidence`` quote must be found in."""
        return strip_html(" ".join(filter(None, [self.passage_html, self.transcript])))


class TestDocument(AuthoringModel):
    """One importable mock test."""

    #: not a pytest test case, despite the name
    __test__ = False

    kind: Literal["test"] = "test"
    slug: str = Field(min_length=3, max_length=120)
    skill: Skill
    variant: Variant = Variant.ACADEMIC
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    difficulty: int = Field(default=3, ge=1, le=5)
    duration_seconds: int = Field(default=3600, gt=0)
    transfer_seconds: int = Field(default=0, ge=0)
    #: must equal the real number of questions; the importer refuses a mismatch
    question_count: int = Field(ge=0, le=40)
    #: ``None`` on re-import means "leave the published flag as it is in the database"
    is_published: bool | None = None
    source: str | None = None
    sections: list[SectionDoc] = Field(min_length=1)

    @property
    def questions(self) -> list[QuestionDoc]:
        return [q for s in self.sections for q in s.questions]

    @model_validator(mode="after")
    def _validate_test(self) -> TestDocument:
        problems: list[str] = []
        if not _SLUG.match(self.slug):
            problems.append(f"slug '{self.slug}' must be lowercase-with-hyphens")

        orders = [s.order for s in self.sections]
        if len(set(orders)) != len(orders):
            problems.append("two sections share the same 'order'")

        self._check_numbering(problems)
        self._check_question_count(problems)
        self._check_skill_requirements(problems)

        if problems:
            raise ValueError("\n".join(problems))
        return self

    # -- rules ------------------------------------------------------------

    def _check_numbering(self, problems: list[str]) -> None:
        """Question numbers must be unique and contiguous from 1 across the whole test."""
        numbers = [q.number for q in self.questions]
        if not numbers:
            return
        seen: set[int] = set()
        for n in numbers:
            if n in seen:
                problems.append(f"Q{n}: question number {n} is used more than once in this test")
            seen.add(n)
        expected = set(range(1, len(numbers) + 1))
        for missing in sorted(expected - seen):
            problems.append(
                f"Q{missing}: question number {missing} is missing — numbers must run "
                f"1..{len(numbers)} with no gaps"
            )
        for extra in sorted(seen - expected):
            problems.append(
                f"Q{extra}: question number {extra} is out of range — this test has "
                f"{len(numbers)} questions, so numbers must run 1..{len(numbers)}"
            )
        by_order = sorted(self.sections, key=lambda s: s.order)
        ordered = [q.number for s in by_order for q in s.questions]
        if ordered != sorted(ordered):
            problems.append(
                "question numbers must increase in document order "
                f"(got {', '.join(f'Q{n}' for n in ordered[:12])}...)"
            )

    def _check_question_count(self, problems: list[str]) -> None:
        actual = len(self.questions)
        if actual != self.question_count:
            problems.append(
                f"question_count says {self.question_count} but the document defines {actual} "
                f"question(s)"
            )

    def _check_skill_requirements(self, problems: list[str]) -> None:
        for s in self.sections:
            if self.skill is Skill.READING and not s.passage_html:
                problems.append(f"section {s.order} ('{s.title}'): reading needs passage_html")
            if self.skill is Skill.LISTENING:
                if not s.audio_url:
                    problems.append(f"section {s.order} ('{s.title}'): listening needs audio_url")
                if not s.transcript:
                    problems.append(
                        f"section {s.order} ('{s.title}'): listening needs a transcript — "
                        f"the answer-review screen is built on it"
                    )
                for q in s.questions:
                    if q.audio_timestamp is None:
                        problems.append(
                            f"Q{q.number}: listening questions need an audio_timestamp "
                            f"so the review screen can jump to the answer"
                        )
            if self.skill is Skill.WRITING:
                if not s.prompt_html:
                    problems.append(f"section {s.order} ('{s.title}'): writing needs prompt_html")
                if s.groups:
                    problems.append(
                        f"section {s.order} ('{s.title}'): a writing task has no questions — "
                        f"remove the 'groups' key"
                    )
                if s.image_url and not (s.image_description or "").strip():
                    problems.append(
                        f"section {s.order} ('{s.title}'): a writing task with an image needs "
                        f"an image_description — the AI grader never sees the picture"
                    )

    # -- soft checks -------------------------------------------------------

    def evidence_problems(self) -> list[str]:
        """Questions whose ``evidence`` quote is not literally in the passage/transcript.

        Not a hard validation rule (an author may paraphrase), but the shipped content is
        held to it by ``tests/test_importer.py`` — a quote that is not in the text means the
        review screen would show a citation the student cannot find.
        """
        problems: list[str] = []
        for s in self.sections:
            reference = s.reference_text().casefold()
            if not reference:
                continue
            for q in s.questions:
                if not q.evidence:
                    continue
                needle = _WS.sub(" ", q.evidence).strip().casefold()
                if needle not in reference:
                    problems.append(
                        f"Q{q.number}: evidence quote is not found verbatim in section "
                        f"{s.order} — {q.evidence[:60]!r}"
                    )
        return problems

    def missing_explanations(self) -> list[str]:
        return [
            f"Q{q.number}: answer key has no explanation"
            for q in self.questions
            if not (q.answer.explanation or "").strip()
        ]


# ----------------------------------------------------------------------- speaking doc


class UsefulPhraseDoc(AuthoringModel):
    phrase: str = Field(min_length=1)
    note: str | None = None


class SpeakingQuestionDoc(AuthoringModel):
    part: SpeakingPart
    topic: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=1)
    #: Part 2 cue-card bullets ("You should say:")
    cue_points: list[str] | None = None
    model_answer: str = Field(min_length=1)
    useful_phrases: list[UsefulPhraseDoc] = Field(default_factory=list)
    band_target: float = Field(default=7.0, ge=4.0, le=9.0)

    @model_validator(mode="after")
    def _validate_question(self) -> SpeakingQuestionDoc:
        problems: list[str] = []
        if self.part is SpeakingPart.PART_2:
            if not self.cue_points or len(self.cue_points) < 3:
                problems.append(
                    f"'{self.question[:50]}': a Part 2 cue card needs at least 3 cue_points"
                )
            words, _ = count_words(self.model_answer)
            if words < 100:
                problems.append(
                    f"'{self.question[:50]}': a Part 2 model answer must be a 2-minute turn "
                    f"(>=100 words), got {words}"
                )
        elif self.cue_points:
            problems.append(
                f"'{self.question[:50]}': cue_points belong to Part 2 only "
                f"(this is {self.part.value})"
            )
        if problems:
            raise ValueError("\n".join(problems))
        return self


class SpeakingBankDocument(AuthoringModel):
    kind: Literal["speaking_bank"]
    title: str = "Speaking question bank"
    questions: list[SpeakingQuestionDoc] = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_bank(self) -> SpeakingBankDocument:
        problems: list[str] = []
        seen: set[str] = set()
        for q in self.questions:
            key = q.question.casefold()
            if key in seen:
                problems.append(f"duplicate question: '{q.question[:60]}'")
            seen.add(key)
        part2_topics = {q.topic.casefold() for q in self.questions if q.part is SpeakingPart.PART_2}
        if part2_topics:
            for q in self.questions:
                if q.part is SpeakingPart.PART_3 and q.topic.casefold() not in part2_topics:
                    problems.append(
                        f"Part 3 question '{q.question[:50]}' has topic '{q.topic}', which no "
                        f"Part 2 cue card uses — Part 3 must follow on from a Part 2 topic"
                    )
        if problems:
            raise ValueError("\n".join(problems))
        return self


# ------------------------------------------------------------------------ writing doc


class WritingPromptDoc(AuthoringModel):
    slug: str = Field(min_length=3, max_length=120)
    task_number: int = Field(ge=1, le=2)
    title: str = Field(min_length=1, max_length=200)
    topic: str | None = None
    prompt_html: str = Field(min_length=1)
    #: Task 1 only: what the chart/process shows, in words (also fed to the AI grader)
    visual_description: str | None = None
    image_url: str | None = None
    min_words: int | None = None
    duration_seconds: int | None = None
    difficulty: int = Field(default=3, ge=1, le=5)

    @model_validator(mode="after")
    def _validate_prompt(self) -> WritingPromptDoc:
        problems: list[str] = []
        if not _SLUG.match(self.slug):
            problems.append(f"slug '{self.slug}' must be lowercase-with-hyphens")
        if self.task_number == 1:
            words, _ = count_words(self.visual_description or "")
            if not self.visual_description:
                problems.append(
                    f"'{self.slug}': an Academic Task 1 prompt needs a visual_description — "
                    f"there is no image in v1 and the AI grader reads this text"
                )
            elif words < 30:
                problems.append(
                    f"'{self.slug}': visual_description is only {words} words — it must describe "
                    f"the chart completely enough to answer from (axes, units, every category, "
                    f"the figures, the period)"
                )
        if self.task_number == 2 and self.visual_description:
            problems.append(f"'{self.slug}': Task 2 has no visual, drop visual_description")
        expected_words = 150 if self.task_number == 1 else 250
        if self.min_words not in (None, expected_words):
            problems.append(
                f"'{self.slug}': Task {self.task_number} min_words must be {expected_words}, "
                f"got {self.min_words}"
            )
        if problems:
            raise ValueError("\n".join(problems))
        return self

    @property
    def effective_min_words(self) -> int:
        return self.min_words or (150 if self.task_number == 1 else 250)

    @property
    def effective_duration(self) -> int:
        return self.duration_seconds or (1200 if self.task_number == 1 else 2400)

    def to_test_document(
        self, variant: Variant = Variant.ACADEMIC, is_published: bool | None = None
    ) -> TestDocument:
        """A writing prompt imports as a one-section, zero-question test."""
        body = self.prompt_html
        if self.visual_description:
            body += f'\n<div class="visual"><p>{self.visual_description}</p></div>'
        return TestDocument(
            kind="test",
            slug=self.slug,
            skill=Skill.WRITING,
            variant=variant,
            title=self.title,
            description=self.topic,
            difficulty=self.difficulty,
            duration_seconds=self.effective_duration,
            question_count=0,
            is_published=is_published,
            sections=[
                SectionDoc(
                    order=1,
                    title=f"Task {self.task_number}",
                    instructions=(
                        "You should spend about "
                        f"{self.effective_duration // 60} minutes on this task. "
                        f"Write at least {self.effective_min_words} words."
                    ),
                    prompt_html=body,
                    image_url=self.image_url,
                    image_description=self.visual_description,
                    min_words=self.effective_min_words,
                )
            ],
        )


class WritingPromptSetDocument(AuthoringModel):
    kind: Literal["writing_prompts"]
    title: str = "Writing prompts"
    variant: Variant = Variant.ACADEMIC
    #: applied to every prompt in the set; omit to leave existing rows alone
    is_published: bool | None = None
    prompts: list[WritingPromptDoc] = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_set(self) -> WritingPromptSetDocument:
        slugs = [p.slug for p in self.prompts]
        dupes = sorted({s for s in slugs if slugs.count(s) > 1})
        if dupes:
            raise ValueError(f"duplicate prompt slug(s): {', '.join(dupes)}")
        return self


ContentDocument = Annotated[
    TestDocument | SpeakingBankDocument | WritingPromptSetDocument,
    Field(discriminator="kind"),
]


# ------------------------------------------------------------------------- loading


class _DocumentWrapper(BaseModel):
    document: ContentDocument


def parse_document(data: Any, source: str | None = None) -> Any:
    """Validate a raw dict into the right document model.

    Raises :class:`ContentValidationError` with one readable line per problem.
    """
    from pydantic import ValidationError

    try:
        return _DocumentWrapper(document=data).document
    except ValidationError as exc:
        raise ContentValidationError(_flatten(exc), source) from exc


def _flatten(exc: Any) -> list[str]:
    problems: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"] if p not in ("document", "function-after"))
        msg = str(err.get("msg", "")).removeprefix("Value error, ")
        for line in msg.splitlines():
            line = line.strip()
            if not line:
                continue
            if not loc or line.startswith(("Q", "section", "slug", "duplicate")):
                problems.append(line)
            else:
                problems.append(f"{loc}: {line}")
    return problems or ["invalid document"]


def load_document(path: str | Path) -> Any:
    """Read and validate one JSON content file."""
    import json

    p = Path(path)
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ContentValidationError([f"invalid JSON: {exc}"], str(p)) from exc
    return parse_document(raw, source=str(p))


# ------------------------------------------------------------------- API out schemas


class SpeakingQuestionOut(ORMModel):
    id: uuid.UUID
    part: SpeakingPart
    topic: str
    question: str
    cue_points: list[str] | None = None
    model_answer: str | None = None
    useful_phrases: list[dict[str, Any]] | None = None
    band_target: float | None = None


class ImportSummaryOut(BaseModel):
    """What an import did, for the admin panel and the CLI."""

    kind: str
    slug: str
    action: str  # created | updated | unchanged
    test_id: uuid.UUID | None = None
    skill: str | None = None
    sections: int = 0
    groups: int = 0
    questions: int = 0
    answer_keys: int = 0
    items: int = 0
    created: int = 0
    updated: int = 0
    warnings: list[str] = Field(default_factory=list)


class ImportRequest(BaseModel):
    document: ContentDocument
    #: overwrite a test that already has scored attempts against it
    force: bool = False


class PublishRequest(BaseModel):
    #: omit to flip the current value
    is_published: bool | None = None


class AdminStats(BaseModel):
    users: int
    admins: int
    tests: int
    published_tests: int
    questions: int
    attempts: int
    scored_attempts: int
    speaking_questions: int
