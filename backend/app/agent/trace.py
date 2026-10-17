"""Agent trace (addition): the steps inside one chat turn, so a multi-step run can be reconstructed afterwards.

Span names and attributes follow the OpenTelemetry GenAI semantic conventions:
`invoke_agent <agent>` for the turn, `chat <model>` for each model call and
`execute_tool <tool>` for each tool call (`gen_ai.operation.name`,
`gen_ai.request.model`, `gen_ai.tool.name`, `gen_ai.usage.*`). Aegis's own steps
are `aegis.grounding` (the number check) and `aegis.template` (a checked
template answer). Prompts, replies and tool arguments are not captured, as the
conventions advise; the turn's text is already in the chat history.

The spans are stored with the turn's `agent_turn` log entry and drawn as a
waterfall in the Control Room. No collector is needed.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

AGENT_NAME = "aegis-advisor"


@dataclass
class Span:
    span_id: int
    parent_id: int | None
    name: str
    start_ms: float
    duration_ms: float = 0.0
    status: str = "ok"  # ok | error
    attributes: dict[str, Any] = field(default_factory=dict)

    def set(self, **attributes: Any) -> None:
        self.attributes.update({k: v for k, v in attributes.items() if v is not None})

    def fail(self, reason: str) -> None:
        self.status = "error"
        self.attributes["error.type"] = reason

    def as_dict(self) -> dict[str, Any]:
        return {
            "span_id": self.span_id,
            "parent_id": self.parent_id,
            "name": self.name,
            "start_ms": round(self.start_ms, 2),
            "duration_ms": round(self.duration_ms, 2),
            "status": self.status,
            "attributes": self.attributes,
        }


class Tracer:
    def __init__(self, clock: Callable[[], float] = time.perf_counter):
        self.clock = clock
        self.origin = clock()
        self.spans: list[Span] = []
        self._stack: list[Span] = []

    def _now_ms(self) -> float:
        return (self.clock() - self.origin) * 1000

    @contextmanager
    def span(self, name: str, **attributes: Any) -> Iterator[Span]:
        span = Span(
            span_id=len(self.spans) + 1,
            parent_id=self._stack[-1].span_id if self._stack else None,
            name=name,
            start_ms=self._now_ms(),
        )
        span.set(**attributes)
        self.spans.append(span)
        self._stack.append(span)
        try:
            yield span
        except Exception as exc:
            span.fail(type(exc).__name__)
            raise
        finally:
            span.duration_ms = self._now_ms() - span.start_ms
            self._stack.pop()

    def export(self) -> list[dict[str, Any]]:
        return [s.as_dict() for s in self.spans]


def usage_of(response: Any) -> dict[str, int]:
    """Token counts the model reported, under the GenAI conventions' names (empty when it reported none)."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return {}
    out = {}
    for source, target in (
        ("input_tokens", "gen_ai.usage.input_tokens"),
        ("output_tokens", "gen_ai.usage.output_tokens"),
        ("cache_read_input_tokens", "gen_ai.usage.cache_read.input_tokens"),
        ("cache_creation_input_tokens", "gen_ai.usage.cache_creation.input_tokens"),
    ):
        value = getattr(usage, source, None)
        if isinstance(value, int):
            out[target] = value
    return out
