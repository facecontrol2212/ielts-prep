"""Unit tests for the Claude writing grader. No network call is ever made."""

import json
from typing import Any

import pytest

from app.models.test import Section
from app.schemas.writing import WritingFeedback
from app.services.ai.client import LLMResponse
from app.services.ai.prompts import (
    WRITING_FEEDBACK_JSON_SCHEMA,
    build_system_prompt,
    build_user_prompt,
)
from app.services.ai.writing_grader import (
    InMemoryGradeCache,
    cache_key,
    count_words,
    evaluate,
    grade,
    official_overall,
    round_to_half,
    under_length_cap,
    valid_corrections,
)

# --------------------------------------------------------------------------- doubles


class FakeClaude:
    """Returns canned responses in order; the last one repeats if the list runs out."""

    def __init__(self, responses: list[str | LLMResponse | Exception], model: str = "fake-sonnet"):
        self._responses = list(responses)
        self.model = model
        self.calls: list[dict[str, Any]] = []

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 8000,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse:
        self.calls.append({"system": system, "messages": messages, "json_schema": json_schema})
        index = min(len(self.calls) - 1, len(self._responses) - 1)
        item = self._responses[index]
        if isinstance(item, Exception):
            raise item
        if isinstance(item, LLMResponse):
            return item
        return LLMResponse(
            text=item,
            model=self.model,
            input_tokens=1200,
            output_tokens=700,
            cache_read_tokens=0,
            cache_write_tokens=0,
        )

    @property
    def call_count(self) -> int:
        return len(self.calls)


def canned(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "band_task": 6.0,
        "band_coherence": 6.0,
        "band_lexical": 6.5,
        "band_grammar": 5.5,
        "band_overall": 6.0,
        "strengths": ["Clear position", "Good paragraphing"],
        "improvements": ["Add data", "Vary sentence structure", "Fix article use"],
        "corrections": [],
        "improved_paragraph": "A rewritten paragraph.",
        "off_topic": False,
        "under_length_penalty": False,
    }
    payload.update(overrides)
    return payload


def canned_json(**overrides: Any) -> str:
    return json.dumps(canned(**overrides))


def words(n: int, word: str = "reliable") -> str:
    return " ".join([word] * n)


@pytest.fixture
def task1_section() -> Section:
    return Section(
        order=1,
        title="Task 1",
        prompt_html="<p>The chart below shows electricity production by source.</p>",
    )


@pytest.fixture
def task2_section() -> Section:
    return Section(order=2, title="Task 2", prompt_html="<p>Some people think X. Discuss.</p>")


@pytest.fixture
def cache() -> InMemoryGradeCache:
    return InMemoryGradeCache()


# --------------------------------------------------------------------------- word counting


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("", 0),
        ("   \n\t ", 0),
        ("one two three", 3),
        ("A well-known fact.", 3),  # hyphenated compound counts once
        ("twenty-five per cent", 3),
        ("Sales rose to 1,500 units.", 5),  # 1,500 is one word
        ("It grew by 50% in 2019.", 6),
        ("don't stop", 2),
        ("a - b", 2),  # a bare dash is not a word
        ("3.7 million", 2),
        ("line\nbreaks   and\tspacing", 4),
    ],
)
def test_count_words(text: str, expected: int) -> None:
    assert count_words(text) == expected


# --------------------------------------------------------------------------- band arithmetic


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (6.3, 6.5),
        (6.2, 6.0),
        (6.25, 6.5),
        (6.74, 6.5),
        (6.75, 7.0),
        (0.1, 0.0),
        (8.9, 9.0),
    ],
)
def test_round_to_half(value: float, expected: float) -> None:
    assert round_to_half(value) == expected


@pytest.mark.parametrize(
    ("bands", "expected"),
    [
        ((6.5, 6.5, 5.0, 7.0), 6.5),  # the worked example in plan.md §7: 25/4 = 6.25 -> 6.5
        ((6.0, 6.0, 6.0, 7.0), 6.5),  # 6.25 -> up to the next half
        ((6.0, 7.0, 7.0, 7.0), 7.0),  # 6.75 -> up to the next whole
        ((5.0, 5.0, 5.0, 5.5), 5.0),  # 5.125 -> down
        ((5.0, 5.0, 5.0, 6.0), 5.5),  # 5.25 -> up to the next half
        ((6.0, 6.0, 7.0, 7.0), 6.5),
        ((9.0, 9.0, 9.0, 9.0), 9.0),
        ((0.0, 0.0, 0.0, 0.0), 0.0),
    ],
)
def test_official_overall(bands: tuple[float, ...], expected: float) -> None:
    assert official_overall(*bands) == expected


@pytest.mark.parametrize(
    ("word_count", "minimum", "expected"),
    [
        (150, 150, None),
        (260, 250, None),
        (149, 150, 6.0),  # 0.993 -> tier 1
        (120, 150, 6.0),  # 0.80 exactly -> tier 1
        (119, 150, 5.0),
        (90, 150, 5.0),  # 0.60 -> tier 2
        (89, 150, 4.0),
        (60, 150, 4.0),  # 0.40 -> tier 3
        (59, 150, 3.0),
        (200, 250, 6.0),  # 0.80 -> tier 1
        (1, 250, 3.0),
    ],
)
def test_under_length_cap(word_count: int, minimum: int, expected: float | None) -> None:
    assert under_length_cap(word_count, minimum) == expected


# --------------------------------------------------------------------------- happy path


def test_parses_canned_json_and_rounds(task2_section: Section, cache: InMemoryGradeCache) -> None:
    client = FakeClaude([canned_json()])
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)

    assert isinstance(feedback, WritingFeedback)
    assert (feedback.band_task, feedback.band_coherence) == (6.0, 6.0)
    assert (feedback.band_lexical, feedback.band_grammar) == (6.5, 5.5)
    # 6.0 + 6.0 + 6.5 + 5.5 = 24 / 4 = 6.0
    assert feedback.band_overall == 6.0
    assert feedback.under_length_penalty is False
    assert client.call_count == 1


def test_usage_is_reported_by_price_band(task2_section: Section, cache: InMemoryGradeCache) -> None:
    """Full-price input, cache reads and cache writes are billed differently — keep them apart."""
    client = FakeClaude(
        [
            LLMResponse(
                text=canned_json(),
                model="claude-sonnet-5",
                input_tokens=100,
                output_tokens=700,
                cache_read_tokens=1100,
                cache_write_tokens=50,
            )
        ]
    )
    outcome = evaluate(task2_section, 2, words(300), client=client, cache=cache)
    assert outcome.model == "claude-sonnet-5"
    assert outcome.input_tokens == 100  # full price only — nothing folded in
    assert outcome.cache_read_tokens == 1100
    assert outcome.cache_write_tokens == 50
    assert outcome.output_tokens == 700
    assert outcome.total_input_tokens == 1250
    assert outcome.calls == 1


def test_usage_accumulates_across_the_retry(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    broken = LLMResponse(
        text="not json",
        model="claude-sonnet-5",
        input_tokens=100,
        output_tokens=40,
        cache_read_tokens=3300,
        cache_write_tokens=0,
    )
    fixed = LLMResponse(
        text=canned_json(),
        model="claude-sonnet-5",
        input_tokens=180,
        output_tokens=700,
        cache_read_tokens=3300,
        cache_write_tokens=0,
    )
    client = FakeClaude([broken, fixed])
    outcome = evaluate(task2_section, 2, words(300), client=client, cache=cache)

    assert client.call_count == 2
    assert outcome.ok
    assert outcome.input_tokens == 280
    assert outcome.output_tokens == 740
    assert outcome.cache_read_tokens == 6600
    assert outcome.cache_write_tokens == 0


def test_cached_outcome_reports_every_counter(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    response = LLMResponse(
        text=canned_json(),
        model="claude-sonnet-5",
        input_tokens=480,
        output_tokens=700,
        cache_read_tokens=0,
        cache_write_tokens=3300,
    )
    client = FakeClaude([response])
    text = words(300)
    evaluate(task2_section, 2, text, client=client, cache=cache)
    hit = evaluate(task2_section, 2, text, client=client, cache=cache)

    assert hit.cached is True
    assert client.call_count == 1
    assert (hit.input_tokens, hit.output_tokens) == (480, 700)
    assert (hit.cache_read_tokens, hit.cache_write_tokens) == (0, 3300)


def test_band_63_rounds_to_65(task2_section: Section, cache: InMemoryGradeCache) -> None:
    client = FakeClaude(
        [canned_json(band_task=6.3, band_coherence=6.3, band_lexical=6.3, band_grammar=6.3)]
    )
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)
    assert feedback.band_task == 6.5
    assert feedback.band_coherence == 6.5
    assert feedback.band_overall == 6.5


def test_bands_out_of_range_are_clamped(task2_section: Section, cache: InMemoryGradeCache) -> None:
    client = FakeClaude(
        [canned_json(band_task=11, band_coherence=-2, band_lexical=9.4, band_grammar=8.5)]
    )
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)
    assert feedback.band_task == 9.0
    assert feedback.band_coherence == 0.0
    assert feedback.band_lexical == 9.0
    # clamping happens before validation, so no retry is spent on it
    assert client.call_count == 1


def test_markdown_fenced_response_is_parsed(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([f"Here you go:\n```json\n{canned_json()}\n```"])
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)
    assert feedback.band_task == 6.0
    assert client.call_count == 1


def test_bare_fence_without_language_is_parsed(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([f"```\n{canned_json()}\n```"])
    assert grade(task2_section, 2, words(300), client=client, cache=cache).band_task == 6.0


# --------------------------------------------------------------------------- corrections


def test_correction_with_wrong_offsets_is_dropped(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    text = "Many student thinks that the goverment should act."
    good = {
        "offset": text.index("Many student thinks"),
        "length": len("Many student thinks"),
        "original": "Many student thinks",
        "suggestion": "Many students think",
        "issue": "grammar",
        "explanation": "Plural subject needs a plural verb.",
    }
    ghost = {
        "offset": 0,
        "length": 12,
        "original": "not in the essay at all",
        "suggestion": "whatever",
        "issue": "grammar",
        "explanation": "Invented span.",
    }
    client = FakeClaude([canned_json(corrections=[good, ghost])])
    feedback = grade(task2_section, 2, text, client=client, cache=cache)

    assert len(feedback.corrections) == 1
    kept = feedback.corrections[0]
    assert text[kept.offset : kept.offset + kept.length] == kept.original


def test_correction_with_unique_original_is_reanchored(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    text = "The goverment should act quickly."
    drifted = {
        "offset": 0,  # wrong: "goverment" starts at 4
        "length": len("goverment"),
        "original": "goverment",
        "suggestion": "government",
        "issue": "spelling",
        "explanation": "Missing 'n'.",
    }
    client = FakeClaude([canned_json(corrections=[drifted])])
    feedback = grade(task2_section, 2, text, client=client, cache=cache)

    assert len(feedback.corrections) == 1
    kept = feedback.corrections[0]
    assert kept.offset == text.index("goverment")
    assert text[kept.offset : kept.offset + kept.length] == "goverment"


def test_ambiguous_correction_is_dropped() -> None:
    from app.schemas.writing import Correction

    text = "the cat sat on the mat"
    ambiguous = Correction(
        offset=99,
        length=3,
        original="the",
        suggestion="a",
        issue="grammar",
        explanation="x",
    )
    assert valid_corrections([ambiguous], text) == []


# --------------------------------------------------------------------------- under length


def test_task1_under_length_caps_task_band(
    task1_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude(
        [canned_json(band_task=7.0, band_coherence=7.0, band_lexical=7.0, band_grammar=7.0)]
    )
    feedback = grade(task1_section, 1, words(90), client=client, cache=cache)

    assert feedback.under_length_penalty is True
    assert feedback.band_task == 5.0  # 90/150 = 0.60 -> capped at 5.0
    assert feedback.band_coherence == 7.0  # the other criteria are untouched
    assert feedback.band_overall == official_overall(5.0, 7.0, 7.0, 7.0)


def test_task2_under_length_caps_task_band(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude(
        [canned_json(band_task=7.5, band_coherence=7.0, band_lexical=7.0, band_grammar=7.0)]
    )
    feedback = grade(task2_section, 2, words(200), client=client, cache=cache)

    assert feedback.under_length_penalty is True
    assert feedback.band_task == 6.0  # 200/250 = 0.80 -> capped at 6.0
    assert feedback.band_overall == official_overall(6.0, 7.0, 7.0, 7.0)


def test_task1_at_160_words_is_not_penalised(
    task1_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([canned_json(band_task=7.0)])
    feedback = grade(task1_section, 1, words(160), client=client, cache=cache)

    assert feedback.under_length_penalty is False
    assert feedback.band_task == 7.0


def test_section_min_words_overrides_the_default(cache: InMemoryGradeCache) -> None:
    section = Section(order=1, title="Task 1", prompt_html="<p>Chart.</p>", min_words=100)
    client = FakeClaude([canned_json(band_task=7.0)])
    feedback = grade(section, 1, words(120), client=client, cache=cache)
    assert feedback.under_length_penalty is False


def test_empty_text_is_band_zero_without_calling_the_model(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([canned_json()])
    feedback = grade(task2_section, 2, "   ", client=client, cache=cache)

    assert client.call_count == 0
    assert feedback.band_overall == 0.0
    assert feedback.under_length_penalty is True


# --------------------------------------------------------------------------- off topic


def test_off_topic_flag_is_honoured_in_code(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude(
        [
            canned_json(
                off_topic=True,
                band_task=7.0,
                band_coherence=7.0,
                band_lexical=7.0,
                band_grammar=7.0,
            )
        ]
    )
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)

    assert feedback.off_topic is True
    assert feedback.band_task == 3.0
    assert feedback.band_overall == official_overall(3.0, 7.0, 7.0, 7.0)


# --------------------------------------------------------------------------- retry / failure


def test_malformed_json_retries_once_then_fails(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude(["not json at all", "still not json"])
    outcome = evaluate(task2_section, 2, words(300), client=client, cache=cache)

    assert client.call_count == 2
    assert outcome.feedback is None
    assert outcome.error and "grading failed after 2 attempts" in outcome.error
    # the failed attempts are still billed, so they are still counted
    assert outcome.input_tokens == 2400
    assert outcome.output_tokens == 1400


def test_missing_field_retries_and_succeeds(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    broken = canned()
    del broken["band_grammar"]
    client = FakeClaude([json.dumps(broken), canned_json()])
    feedback = grade(task2_section, 2, words(300), client=client, cache=cache)

    assert client.call_count == 2
    assert feedback.band_grammar == 5.5
    # the retry carries the validation error back to the model
    retry_messages = client.calls[1]["messages"]
    assert retry_messages[-1]["role"] == "user"
    assert "band_grammar" in retry_messages[-1]["content"]


def test_grading_never_raises_on_transport_error(
    task2_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([RuntimeError("connection reset")])
    outcome = evaluate(task2_section, 2, words(300), client=client, cache=cache)

    assert outcome.feedback is None
    assert outcome.error == "RuntimeError: connection reset"
    assert client.call_count == 1


def test_failed_grading_is_not_cached(task2_section: Section, cache: InMemoryGradeCache) -> None:
    text = words(300)
    first = FakeClaude(["garbage", "garbage"])
    assert evaluate(task2_section, 2, text, client=first, cache=cache).feedback is None
    second = FakeClaude([canned_json()])
    assert evaluate(task2_section, 2, text, client=second, cache=cache).ok
    assert second.call_count == 1


# --------------------------------------------------------------------------- caching


def test_identical_input_is_graded_once(task2_section: Section, cache: InMemoryGradeCache) -> None:
    text = words(300)
    client = FakeClaude([canned_json()])

    first = evaluate(task2_section, 2, text, client=client, cache=cache)
    second = evaluate(task2_section, 2, text, client=client, cache=cache)

    assert client.call_count == 1
    assert second.cached is True
    assert second.feedback == first.feedback
    assert (second.input_tokens, second.output_tokens) == (1200, 700)


def test_different_text_misses_the_cache(task2_section: Section, cache: InMemoryGradeCache) -> None:
    client = FakeClaude([canned_json()])
    evaluate(task2_section, 2, words(300), client=client, cache=cache)
    evaluate(task2_section, 2, words(301), client=client, cache=cache)
    assert client.call_count == 2


def test_cache_key_is_sensitive_to_every_input() -> None:
    base = dict(model="claude-sonnet-5", task_number=2, prompt="p", text="t")
    key = cache_key(**base)
    assert key != cache_key(**{**base, "model": "claude-opus-5"})
    assert key != cache_key(**{**base, "task_number": 1})
    assert key != cache_key(**{**base, "prompt": "q"})
    assert key != cache_key(**{**base, "text": "u"})
    assert key == cache_key(**base)
    # no field-boundary collisions
    assert cache_key(model="ab", task_number=2, prompt="", text="") != cache_key(
        model="a", task_number=2, prompt="b", text=""
    )


def test_cache_evicts_the_oldest_entry(task2_section: Section) -> None:
    small = InMemoryGradeCache(max_entries=1)
    client = FakeClaude([canned_json()])
    evaluate(task2_section, 2, words(300), client=client, cache=small)
    evaluate(task2_section, 2, words(301), client=client, cache=small)
    evaluate(task2_section, 2, words(300), client=client, cache=small)
    assert client.call_count == 3


# --------------------------------------------------------------------------- prompt contract


def test_system_prompt_contains_the_right_criterion_per_task() -> None:
    task1 = build_system_prompt(1)
    task2 = build_system_prompt(2)

    assert "TASK ACHIEVEMENT" in task1
    assert "TASK RESPONSE" not in task1
    assert "TASK RESPONSE" in task2
    assert "TASK ACHIEVEMENT" not in task2

    for prompt in (task1, task2):
        assert "COHERENCE AND COHESION" in prompt
        assert "LEXICAL RESOURCE" in prompt
        assert "GRAMMATICAL RANGE AND ACCURACY" in prompt
        assert "DO NOT DEFAULT TO 6.5" in prompt
        # every band from 9 down to 2 must be anchored, or the model regresses to the mean
        for band in range(2, 10):
            assert f"\n{band}  " in prompt or f"\n{band} " in prompt


def test_system_prompt_is_stable_for_caching() -> None:
    assert build_system_prompt(2) == build_system_prompt(2)


def test_invalid_task_number_is_rejected() -> None:
    with pytest.raises(ValueError, match="task_number"):
        build_system_prompt(3)


def test_user_prompt_carries_the_countable_facts() -> None:
    prompt = build_user_prompt(
        task_number=1, prompt="The chart shows X.", text="Hello world.", word_count=2
    )
    assert "The chart shows X." in prompt
    assert "2" in prompt
    assert "Hello world." in prompt


def test_html_is_stripped_from_the_prompt(cache: InMemoryGradeCache) -> None:
    section = Section(order=1, title="Task 1", prompt_html="<p>The <b>chart</b> shows X.</p>")
    client = FakeClaude([canned_json()])
    evaluate(section, 1, words(200), client=client, cache=cache)
    user_message = client.calls[0]["messages"][0]["content"]
    assert "<b>" not in user_message
    assert "The chart shows X." in user_message


def test_task1_prompt_carries_the_chart_description(cache: InMemoryGradeCache) -> None:
    """Without this, Task 1 grading is blind to the visual the candidate was describing."""
    section = Section(
        order=1,
        title="Task 1",
        prompt_html="<p>The chart below shows electricity production by source.</p>",
        image_url="https://cdn.example.com/chart-01.png",
        image_description=(
            "A line graph with four series — coal, gas, nuclear and renewables — plotted from "
            "1990 to 2020. Coal falls from 55% to 18%; renewables rise from 3% to 31%."
        ),
    )
    client = FakeClaude([canned_json()])
    evaluate(section, 1, words(200), client=client, cache=cache)

    user_message = client.calls[0]["messages"][0]["content"]
    assert "DESCRIPTION OF THE ACCOMPANYING VISUAL" in user_message
    assert "renewables rise from 3% to 31%" in user_message
    # the URL is useless to a text model and must not be pushed at it as if it were content
    assert "https://cdn.example.com/chart-01.png" not in user_message


def test_prompt_omits_the_visual_block_when_there_is_no_description(
    task1_section: Section, cache: InMemoryGradeCache
) -> None:
    client = FakeClaude([canned_json()])
    evaluate(task1_section, 1, words(200), client=client, cache=cache)
    assert "ACCOMPANYING VISUAL" not in client.calls[0]["messages"][0]["content"]


def test_chart_description_changes_the_cache_key_via_the_prompt(
    cache: InMemoryGradeCache,
) -> None:
    """Two different charts with the same wording are different gradings, not a cache hit."""
    described = Section(
        order=1,
        title="Task 1",
        prompt_html="<p>The chart below shows X.</p>",
        image_description="Coal falls sharply.",
    )
    plain = Section(order=1, title="Task 1", prompt_html="<p>The chart below shows X.</p>")
    client = FakeClaude([canned_json()])
    text = words(200)

    evaluate(described, 1, text, client=client, cache=cache)
    evaluate(plain, 1, text, client=client, cache=cache)
    assert client.call_count == 2


def test_json_schema_matches_the_pydantic_model() -> None:
    """A drift guard: the wire schema and WritingFeedback must describe the same object."""
    schema_keys = set(WRITING_FEEDBACK_JSON_SCHEMA["properties"])
    model_keys = set(WritingFeedback.model_fields)
    assert schema_keys == model_keys
    assert set(WRITING_FEEDBACK_JSON_SCHEMA["required"]) == model_keys

    correction_schema = WRITING_FEEDBACK_JSON_SCHEMA["properties"]["corrections"]["items"]
    from app.schemas.writing import Correction

    assert set(correction_schema["properties"]) == set(Correction.model_fields)


def test_schema_is_passed_to_the_client(task2_section: Section, cache: InMemoryGradeCache) -> None:
    client = FakeClaude([canned_json()])
    evaluate(task2_section, 2, words(300), client=client, cache=cache)
    assert client.calls[0]["json_schema"] is WRITING_FEEDBACK_JSON_SCHEMA
