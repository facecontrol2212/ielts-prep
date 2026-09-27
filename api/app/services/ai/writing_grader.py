"""Claude-backed IELTS Writing grader.

The model is asked for a judgement; everything that can be decided by a rule is decided here, in
code, so that two identical scripts always get identical treatment:

* word count (§ :func:`count_words`)
* the under-length penalty (§ :data:`TASK_MIN_WORDS` and :func:`under_length_cap`)
* rounding of every band to the nearest 0.5 and clamping to 0..9
* the overall band (official IELTS rounding of the mean of the four criteria)
* honouring the model's off-topic flag
* discarding corrections whose offsets do not index the student's text
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Protocol

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.attempt import WritingSubmission
from app.models.test import Section
from app.schemas.writing import Correction, WritingFeedback
from app.services.ai.client import LLMClient, LLMResponse, get_llm_client
from app.services.ai.prompts import (
    WRITING_FEEDBACK_JSON_SCHEMA,
    build_repair_prompt,
    build_system_prompt,
    build_user_prompt,
)

# --------------------------------------------------------------------------- word counting

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html(value: str | None) -> str:
    """Prompts are stored as HTML; the model should see the text, not the markup."""
    if not value:
        return ""
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", value)).strip()


def count_words(text: str) -> int:
    """IELTS-style word count.

    A "word" is a whitespace-delimited token containing at least one letter or digit. This gives
    the behaviour the exam uses:

    * a hyphenated compound is one word — ``well-known`` = 1, ``twenty-five`` = 1
    * a number is one word, whatever its punctuation — ``1,500`` = 1, ``50%`` = 1, ``3.7`` = 1
    * contractions are one word — ``don't`` = 1
    * stray punctuation is not a word — ``a - b`` = 2, not 3
    """
    return sum(1 for token in text.split() if any(ch.isalnum() for ch in token))


# --------------------------------------------------------------------------- band arithmetic


def clamp_band(value: float) -> float:
    return max(0.0, min(9.0, float(value)))


def round_to_half(value: float) -> float:
    """Nearest 0.5, ties away from zero. 6.3 -> 6.5, 6.24 -> 6.0, 6.25 -> 6.5, 6.74 -> 6.5."""
    doubled = Decimal(str(float(value))) * 2
    return float(doubled.quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2)


def normalise_band(value: float) -> float:
    return clamp_band(round_to_half(clamp_band(value)))


def official_overall(*bands: float) -> float:
    """Average the criteria and apply official IELTS rounding.

    The published rule: average, then ``.25`` rounds up to the next half band and ``.75`` rounds up
    to the next whole band; anything else rounds down to the nearest half. That is exactly
    "nearest half band, ties upward", which is what this computes.

    ``(6.5 + 6.5 + 5.0 + 7.0) / 4 = 6.25 -> 6.5``
    """
    if not bands:
        return 0.0
    total = sum(Decimal(str(float(b))) for b in bands)
    average = total / Decimal(len(bands))
    stepped = (average * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2
    return clamp_band(float(stepped))


# --------------------------------------------------------------------------- length penalty

#: Official minimum length per task. A section may override it via ``Section.min_words``.
TASK_MIN_WORDS: dict[int, int] = {1: 150, 2: 250}

#: Band ceiling applied to the *task* criterion as a function of how short the script is.
#:
#: The rule, stated exactly:
#:   ``ratio = word_count / minimum`` (minimum = ``section.min_words`` or 150 for Task 1 /
#:   250 for Task 2).
#:   ratio >= 1.00            -> no penalty
#:   0.80 <= ratio < 1.00     -> under_length_penalty, band_task capped at 6.0
#:   0.60 <= ratio < 0.80     -> under_length_penalty, band_task capped at 5.0
#:   0.40 <= ratio < 0.60     -> under_length_penalty, band_task capped at 4.0
#:   0.00 <  ratio < 0.40     -> under_length_penalty, band_task capped at 3.0
#:   word_count == 0          -> not sent to the model at all; every band is 0.0
#: Only the task criterion is capped — the other three are judged on what was written, which is
#: how a real examiner treats a short script. The overall band is recomputed after the cap, so a
#: short script is penalised once, through Task Achievement/Response.
LENGTH_PENALTY_TIERS: tuple[tuple[float, float], ...] = (
    (0.80, 6.0),
    (0.60, 5.0),
    (0.40, 4.0),
    (0.00, 3.0),
)

#: A script that answers a different question cannot score above this on the task criterion.
OFF_TOPIC_TASK_CAP = 3.0


def min_words_for(section: Section | None, task_number: int) -> int:
    if section is not None and section.min_words:
        return int(section.min_words)
    return TASK_MIN_WORDS.get(task_number, 250)


def under_length_cap(word_count: int, minimum: int) -> float | None:
    """The band ceiling for the task criterion, or ``None`` when the script is long enough."""
    if minimum <= 0 or word_count >= minimum:
        return None
    ratio = word_count / minimum
    for threshold, cap in LENGTH_PENALTY_TIERS:
        if ratio >= threshold:
            return cap
    return LENGTH_PENALTY_TIERS[-1][1]


# --------------------------------------------------------------------------- results & errors


class GradingError(RuntimeError):
    """The model could not be made to produce a usable assessment."""


@dataclass(slots=True)
class GradingOutcome:
    """What one grading attempt produced, successful or not.

    The four token counters are kept apart because they are billed at three different rates:
    ``input_tokens`` at full price, ``cache_read_tokens`` at ~0.1x and ``cache_write_tokens`` at
    ~1.25x. Summing them before they are stored would make the unit economics unrecoverable.
    """

    feedback: WritingFeedback | None = None
    model: str = ""
    #: Full-price input only — cache reads and writes are *not* folded in here.
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    error: str | None = None
    cached: bool = False
    calls: int = 0

    @property
    def ok(self) -> bool:
        return self.feedback is not None

    @property
    def total_input_tokens(self) -> int:
        """Every input token the model read this grading, at whatever price."""
        return self.input_tokens + self.cache_read_tokens + self.cache_write_tokens


# --------------------------------------------------------------------------- cache


class GradeCache(Protocol):
    """Keyed by sha256(model, task_number, prompt, text) — see :func:`cache_key`.

    "prompt" is the whole task as the candidate saw it: the section prompt *and* the description
    of any Task 1 visual, so that fixing either one re-grades rather than serving a stale band.
    """

    def get(self, key: str) -> GradingOutcome | None: ...

    def set(self, key: str, value: GradingOutcome) -> None: ...


@dataclass(slots=True)
class InMemoryGradeCache:
    """Process-local LRU. Good enough for v1; swap for Redis behind the same protocol."""

    max_entries: int = 512
    _store: OrderedDict[str, GradingOutcome] = field(default_factory=OrderedDict)

    def get(self, key: str) -> GradingOutcome | None:
        value = self._store.get(key)
        if value is not None:
            self._store.move_to_end(key)
        return value

    def set(self, key: str, value: GradingOutcome) -> None:
        self._store[key] = value
        self._store.move_to_end(key)
        while len(self._store) > self.max_entries:
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()


_cache: GradeCache = InMemoryGradeCache()


def get_grade_cache() -> GradeCache:
    return _cache


def set_grade_cache(cache: GradeCache) -> None:
    global _cache
    _cache = cache


def cache_key(*, model: str, task_number: int, prompt: str, text: str) -> str:
    digest = hashlib.sha256()
    for part in (model, str(task_number), prompt, text):
        digest.update(part.encode("utf-8"))
        digest.update(b"\x1f")
    return digest.hexdigest()


# --------------------------------------------------------------------------- JSON handling

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(?P<body>.*?)\s*```\s*$", re.DOTALL)
_BAND_FIELDS = (
    "band_task",
    "band_coherence",
    "band_lexical",
    "band_grammar",
    "band_overall",
)


def extract_json(raw: str) -> dict[str, Any]:
    """Pull a JSON object out of a model response, tolerating markdown fences and stray prose."""
    if not raw or not raw.strip():
        raise GradingError("model returned an empty response")

    candidate = raw.strip()
    fenced = _FENCE_RE.match(candidate)
    if fenced:
        candidate = fenced.group("body").strip()

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise GradingError("model response contained no JSON object") from None
        try:
            parsed = json.loads(candidate[start : end + 1])
        except json.JSONDecodeError as exc:
            raise GradingError(f"model response was not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise GradingError("model response was not a JSON object")
    return parsed


def _prenormalise_bands(payload: dict[str, Any]) -> dict[str, Any]:
    """Round and clamp the bands *before* pydantic sees them.

    A band of 11 or -1 is a value we know how to fix (clamp), so fixing it is cheaper and kinder
    than burning a retry. A *missing* or non-numeric band is not fixable here and is left alone so
    that pydantic rejects it and the retry path takes over.
    """
    out = dict(payload)
    for key in _BAND_FIELDS:
        value = out.get(key)
        if isinstance(value, bool) or not isinstance(value, int | float):
            continue
        out[key] = normalise_band(value)
    return out


def parse_feedback(raw: str) -> WritingFeedback:
    """Raw model text -> a validated :class:`WritingFeedback`. Raises :class:`GradingError`."""
    payload = _prenormalise_bands(extract_json(raw))
    try:
        return WritingFeedback.model_validate(payload)
    except ValidationError as exc:
        raise GradingError(f"response did not match WritingFeedback: {exc.errors()}") from exc


# --------------------------------------------------------------------------- post-processing


def valid_corrections(corrections: list[Correction], text: str) -> list[Correction]:
    """Anchor each correction to a real span of ``text``, dropping the ones that cannot be.

    **The offsets the model returns are a hint, not the truth.** Language models are unreliable at
    counting characters, so ``offset``/``length`` are never trusted on their own — the authority is
    ``original``, the substring the model quoted. Three cases:

    * the offsets do land on ``original`` — keep the correction as it stands;
    * they do not, but ``original`` occurs exactly once in the text — re-anchor the span to that
      unambiguous occurrence and keep it;
    * anything else (``original`` absent, or occurring more than once so the intended span is
      genuinely unknown) — drop it.

    A correction the UI cannot anchor is worse than no correction, because it highlights the wrong
    words and the student trusts the highlight.
    """
    kept: list[Correction] = []
    for correction in corrections:
        original = correction.original
        if not original:
            continue
        offset, length = correction.offset, correction.length
        if offset >= 0 and length == len(original) and text[offset : offset + length] == original:
            kept.append(correction)
            continue
        first = text.find(original)
        if first != -1 and text.find(original, first + 1) == -1:
            kept.append(correction.model_copy(update={"offset": first, "length": len(original)}))
    return kept


def apply_rules(
    feedback: WritingFeedback,
    *,
    text: str,
    word_count: int,
    minimum: int,
) -> WritingFeedback:
    """Apply every deterministic rule to a model-produced assessment."""
    band_task = normalise_band(feedback.band_task)
    band_coherence = normalise_band(feedback.band_coherence)
    band_lexical = normalise_band(feedback.band_lexical)
    band_grammar = normalise_band(feedback.band_grammar)

    if feedback.off_topic:
        band_task = min(band_task, OFF_TOPIC_TASK_CAP)

    cap = under_length_cap(word_count, minimum)
    if cap is not None:
        band_task = min(band_task, cap)

    return feedback.model_copy(
        update={
            "band_task": band_task,
            "band_coherence": band_coherence,
            "band_lexical": band_lexical,
            "band_grammar": band_grammar,
            "band_overall": official_overall(band_task, band_coherence, band_lexical, band_grammar),
            "under_length_penalty": cap is not None,
            "corrections": valid_corrections(feedback.corrections, text),
        }
    )


def empty_feedback(reason: str) -> WritingFeedback:
    """A blank script is a band 0; no reason to spend tokens finding that out."""
    return WritingFeedback(
        band_task=0.0,
        band_coherence=0.0,
        band_lexical=0.0,
        band_grammar=0.0,
        band_overall=0.0,
        strengths=[],
        improvements=[reason],
        corrections=[],
        improved_paragraph=None,
        off_topic=False,
        under_length_penalty=True,
    )


# --------------------------------------------------------------------------- the grader


def evaluate(
    section: Section | None,
    task_number: int,
    text: str,
    *,
    client: LLMClient | None = None,
    cache: GradeCache | None = None,
    use_cache: bool = True,
) -> GradingOutcome:
    """Grade one task and report the token spend. Never raises for a model failure."""
    client = client or get_llm_client()
    cache = cache or get_grade_cache()
    text = text or ""
    word_count = count_words(text)
    minimum = min_words_for(section, task_number)
    prompt = strip_html(section.prompt_html if section is not None else None)
    visual = (section.image_description if section is not None else None) or ""

    if word_count == 0:
        return GradingOutcome(
            feedback=empty_feedback("Write an answer — nothing was submitted for this task."),
            model=client.model,
        )

    # The chart description is part of what the candidate was asked to describe, so it belongs in
    # the "prompt" half of the key: correcting a wrong description must invalidate the old grade.
    key = cache_key(
        model=client.model,
        task_number=task_number,
        prompt=f"{prompt}\x1e{visual}",
        text=text,
    )
    if use_cache:
        hit = cache.get(key)
        if hit is not None and hit.ok:
            return GradingOutcome(
                feedback=hit.feedback,
                model=hit.model,
                input_tokens=hit.input_tokens,
                output_tokens=hit.output_tokens,
                cache_read_tokens=hit.cache_read_tokens,
                cache_write_tokens=hit.cache_write_tokens,
                cached=True,
                calls=0,
            )

    system = build_system_prompt(task_number)
    user = build_user_prompt(
        task_number=task_number,
        prompt=prompt,
        text=text,
        word_count=word_count,
        # `Section.image_url` is a link, useless to a text model; `image_description` is the
        # authored prose description of the Task 1 chart, map or process, and is what lets the
        # model judge whether the candidate reported the right features.
        image_description=visual or None,
    )
    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]

    calls = 0
    last_error = ""
    last_response: LLMResponse | None = None
    input_tokens = output_tokens = cache_read_tokens = cache_write_tokens = 0
    model_name = client.model

    for attempt in (1, 2):
        try:
            last_response = client.complete(
                system=system,
                messages=messages,
                json_schema=WRITING_FEEDBACK_JSON_SCHEMA,
            )
        except Exception as exc:  # network, auth, rate limit — stored, never a 500
            calls += 1
            return GradingOutcome(
                model=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                error=f"{type(exc).__name__}: {exc}",
                calls=calls,
            )
        calls += 1
        input_tokens += last_response.input_tokens
        output_tokens += last_response.output_tokens
        cache_read_tokens += last_response.cache_read_tokens
        cache_write_tokens += last_response.cache_write_tokens
        model_name = last_response.model or model_name

        try:
            feedback = parse_feedback(last_response.text)
        except GradingError as exc:
            last_error = str(exc)
            if attempt == 2:
                break
            messages = [
                *messages,
                {"role": "assistant", "content": last_response.text or "(empty response)"},
                {"role": "user", "content": build_repair_prompt(last_response.text, last_error)},
            ]
            continue

        outcome = GradingOutcome(
            feedback=apply_rules(feedback, text=text, word_count=word_count, minimum=minimum),
            model=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            calls=calls,
        )
        if use_cache:
            cache.set(key, outcome)
        return outcome

    return GradingOutcome(
        model=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        error=f"grading failed after {calls} attempts: {last_error}",
        calls=calls,
    )


def grade(
    section: Section | None,
    task_number: int,
    text: str,
    *,
    client: LLMClient | None = None,
    cache: GradeCache | None = None,
) -> WritingFeedback:
    """Grade one task. Raises :class:`GradingError` if the model could not be made to comply."""
    outcome = evaluate(section, task_number, text, client=client, cache=cache)
    if outcome.feedback is None:
        raise GradingError(outcome.error or "grading failed")
    return outcome.feedback


def grade_submission(
    db: Session,
    submission: WritingSubmission,
    *,
    section: Section | None = None,
    client: LLMClient | None = None,
    cache: GradeCache | None = None,
) -> WritingSubmission:
    """Grade a stored submission and persist the bands, the feedback and the token spend."""
    if section is None:
        section = db.get(Section, submission.section_id)

    submission.word_count = count_words(submission.text or "")
    outcome = evaluate(
        section,
        submission.task_number,
        submission.text or "",
        client=client,
        cache=cache,
    )

    submission.model = outcome.model or None
    # Stored apart, not summed: full-price input, output, 0.1x cache reads, 1.25x cache writes.
    submission.input_tokens = outcome.input_tokens
    submission.output_tokens = outcome.output_tokens
    submission.cache_read_tokens = outcome.cache_read_tokens
    submission.cache_write_tokens = outcome.cache_write_tokens

    if outcome.feedback is None:
        submission.grading_error = outcome.error
        submission.graded_at = None
        submission.band_task = None
        submission.band_coherence = None
        submission.band_lexical = None
        submission.band_grammar = None
        submission.band_overall = None
        submission.feedback = None
    else:
        fb = outcome.feedback
        submission.grading_error = None
        submission.graded_at = datetime.now(UTC)
        submission.band_task = fb.band_task
        submission.band_coherence = fb.band_coherence
        submission.band_lexical = fb.band_lexical
        submission.band_grammar = fb.band_grammar
        submission.band_overall = fb.band_overall
        submission.feedback = fb.model_dump(mode="json")

    db.add(submission)
    return submission
