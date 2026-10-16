"""The Claude API call (Section 2.5.6), behind one small interface so tests can swap in a scripted fake.

Request shape (Anthropic Python SDK 1.x, Claude Opus 5.5):
- client.beta.messages.create with the server-side fallback beta and
  fallbacks="default": a safety-classifier decline is re-run server-side on
  Anthropic's recommended fallback model instead of failing the turn.
- Thinking is always on for Opus 5.5 (adaptive, not configurable); effort
  medium keeps replies under the 10-second target.
- strict tools, tool_choice left at auto (forced tool use is a 400 here).
- The system prompt carries cache_control, so the tool list and system
  prompt (rendered before it) are served from the prompt cache.
- timeout 20 s and one retry at the client; the orchestrator also passes the
  time left in the turn as a per-request timeout.
"""

from __future__ import annotations

from typing import Any, Protocol

import anthropic

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import TOOL_DEFINITIONS

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 16000
EFFORT = "medium"


class LLM(Protocol):
    def create(self, *, messages: list[dict[str, Any]], timeout: float) -> Any: ...


class ClaudeClient:
    def __init__(self, api_key: str, model: str, timeout: float = 20.0):
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=1)

    def create(self, *, messages: list[dict[str, Any]], timeout: float) -> Any:
        return self._client.with_options(timeout=max(1.0, timeout)).beta.messages.create(
            model=self.model,
            max_tokens=MAX_TOKENS,
            betas=[FALLBACK_BETA],
            fallbacks="default",
            output_config={"effort": EFFORT},
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            tools=TOOL_DEFINITIONS,
            messages=messages,
        )


# Errors that mean "the model is unavailable": answer from templates instead (FR-6.4).
MODEL_ERRORS: tuple[type[BaseException], ...] = (anthropic.APIError, TimeoutError, ConnectionError)
