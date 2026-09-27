"""Thin wrapper around the Anthropic Messages API.

Design rules for this module:

* **Lazy** — the `anthropic` SDK object is only constructed on the first real call, so importing
  the app (or running the test suite) never needs an API key and never opens a socket.
* **Substitutable** — everything downstream depends on the :class:`LLMClient` protocol, so a test
  double is a plain object with a ``complete()`` method. :func:`set_llm_client` swaps the
  process-wide instance.
* **Accountable** — every call returns the token usage alongside the text so the caller can store
  the unit economics on the submission row.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.core.config import settings

#: Plenty for a graded essay (bands + ~5 improvements + ~10 corrections + a rewritten paragraph),
#: while still capping the damage if the model decides to write an essay of its own.
DEFAULT_MAX_TOKENS = 8000

#: Claude Sonnet 5 only accepts ``{"type": "adaptive"}`` (or nothing) — ``budget_tokens`` is a 400.
THINKING = {"type": "adaptive"}

#: `low | medium | high | xhigh | max`. Grading a 250-word essay against a rubric is a bounded
#: judgement task: "medium" keeps the thinking spend sane without hurting rubric adherence.
DEFAULT_EFFORT = "medium"


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """The parsed text of a completion plus what it cost."""

    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    @property
    def total_input_tokens(self) -> int:
        """Every input token the model actually read, cached or not."""
        return self.input_tokens + self.cache_read_tokens + self.cache_write_tokens


@runtime_checkable
class LLMClient(Protocol):
    """The only surface the grader depends on. Implement this to fake Claude in a test."""

    @property
    def model(self) -> str: ...

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = DEFAULT_MAX_TOKENS,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse: ...


class AnthropicClient:
    """Real Claude client. Constructs the SDK lazily, on first use."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 120.0,
        max_retries: int = 2,
        cache_system_prompt: bool = True,
        effort: str = DEFAULT_EFFORT,
    ) -> None:
        self._api_key = settings.anthropic_api_key if api_key is None else api_key
        self._model = model or settings.anthropic_model
        self._timeout = timeout
        self._max_retries = max_retries
        self._cache_system_prompt = cache_system_prompt
        self._effort = effort
        self._sdk: Any | None = None

    @property
    def model(self) -> str:
        return self._model

    @property
    def sdk(self) -> Any:
        """The underlying `anthropic.Anthropic` client, built on first access."""
        if self._sdk is None:
            if not self._api_key:
                raise RuntimeError(
                    "anthropic_api_key is not configured; set ANTHROPIC_API_KEY to enable "
                    "AI writing evaluation"
                )
            import anthropic  # imported here so the module stays import-cheap

            self._sdk = anthropic.Anthropic(
                api_key=self._api_key,
                timeout=self._timeout,
                max_retries=self._max_retries,
            )
        return self._sdk

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = DEFAULT_MAX_TOKENS,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse:
        system_blocks: list[dict[str, Any]] = [{"type": "text", "text": system}]
        if self._cache_system_prompt:
            # The rubric is byte-identical for every submission of the same task type, and it is
            # the first thing in the request, so it is the ideal cache prefix. Sonnet 5 needs a
            # >=1024-token prefix to cache at all; the descriptors are comfortably above that.
            system_blocks[0]["cache_control"] = {"type": "ephemeral"}

        output_config: dict[str, Any] = {"effort": self._effort}
        if json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}

        response = self.sdk.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_blocks,
            messages=messages,
            thinking=THINKING,
            output_config=output_config,
        )
        return _to_llm_response(response, fallback_model=self._model)


def _to_llm_response(response: Any, *, fallback_model: str) -> LLMResponse:
    """Pull the text blocks and the usage counters off an SDK ``Message``."""
    text = "".join(
        block.text
        for block in getattr(response, "content", [])
        if getattr(block, "type", None) == "text"
    )
    usage = getattr(response, "usage", None)
    return LLMResponse(
        text=text,
        model=getattr(response, "model", None) or fallback_model,
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
        cache_read_tokens=int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        cache_write_tokens=int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
    )


_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """The process-wide client. Built on first use, never at import time."""
    global _client
    if _client is None:
        _client = AnthropicClient()
    return _client


def set_llm_client(client: LLMClient | None) -> None:
    """Install a substitute (or `None` to reset). Tests use this; production never calls it."""
    global _client
    _client = client
