"""The agent's turn loop (Section 2.5.6): a manual tool-use loop, so the backend sees and controls every step.

1. Build the messages: the last 10 chat messages, then the new user message
   with a context block (tier, scores, maximum loss, current proposal). No
   names or emails are sent.
2. Call the model.
3. On tool_use: pass each call to the permission broker, run the allowed ones,
   return all results in one user message (denied or invalid calls come back
   with is_error). At most 4 tool rounds and 20 seconds per turn.
4. On end_turn: run the grounding and wording check. On failure, regenerate
   once with a system note naming the problem; if it fails again, fall back.
5. On refusal, max_tokens, a timeout or an API error: fall back to templates.
6. Save the turn and log every tool call with its tier and decision.

Additions: while compliance has the advisor suspended, no turn runs at all
(the broker refuses every call too). Each turn returns cards built from the
broker's outcomes and the source of every number in the reply. Each turn is
also traced (spans named after the OpenTelemetry GenAI conventions: the turn,
each model call, each tool call, the number check, a template answer) and its
message is screened for threat signals, both stored with the turn's log entry.

The history stays append-only within a turn: assistant content (thinking
blocks included) is echoed back unchanged, and the regeneration note is a
mid-conversation system message after the last user turn, not an edit.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent import fallback, threats
from app.agent.broker import PermissionBroker
from app.agent.cards import card_for, cards_for
from app.agent.grounding import check_reply
from app.agent.llm import MODEL_ERRORS
from app.agent.prompts import REGENERATE_NOTE, context_block
from app.agent.tools import ToolContext
from app.agent.trace import AGENT_NAME, Tracer, usage_of
from app.models import ChatMessage, Proposal, User
from app.services import controls, logs, profiles, proposals
from app.services.context import AppContext

log = logging.getLogger("aegis.agent")

MAX_TOOL_ROUNDS = 4
TURN_BUDGET_SECONDS = 20.0
HISTORY_MESSAGES = 10

SUSPENDED_REPLY = (
    "The AI advisor is paused by the compliance team. Your profile and proposals are unchanged and every screen "
    "still works. Orders still need your own Confirm click."
)

Event = Callable[[dict[str, Any]], None]


@dataclass
class TurnResult:
    reply: str
    mode: str  # model | fallback | suspended
    grounding: str  # passed | regenerated | fallback
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    cards: list[dict[str, Any]] = field(default_factory=list)
    number_sources: list[dict[str, Any]] = field(default_factory=list)
    proposals_made: list[dict[str, Any]] = field(default_factory=list)
    # Additions: the turn's trace, the message's threat signals, token use and which model served it.
    trace: list[dict[str, Any]] = field(default_factory=list)
    signals: list[dict[str, str]] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    served_model: str | None = None
    fallback_reason: str | None = None
    latency_ms: float = 0.0


def _proposals_made(broker: PermissionBroker) -> list[dict[str, Any]]:
    """Proposals the agent created or revised this turn, with the gate's decision on each."""
    return [
        {"tool": o.tool, "proposal_id": o.result["id"], "gate": o.result["gate"]["decision"]}
        for o in broker.outcomes
        if o.tool in ("create_proposal", "revise_proposal") and o.result is not None
    ]


def _block_type(block: Any) -> str:
    return block.get("type") if isinstance(block, dict) else getattr(block, "type", "")


def echo_content(content: list[Any]) -> list[Any]:
    """Assistant content to send back, unchanged - except across a server-side fallback boundary.

    After a fallback, thinking and tool_use blocks before the last `fallback`
    block belong to the declined attempt and are dropped; text blocks stay.
    The `fallback` block itself is an audit marker and is dropped too.
    """
    last = max((i for i, b in enumerate(content) if _block_type(b) == "fallback"), default=-1)
    kept = []
    for i, block in enumerate(content):
        kind = _block_type(block)
        if kind == "fallback":
            continue
        if i < last and kind != "text":
            continue
        kept.append(block)
    return kept


def _text_of(content: list[Any]) -> str:
    parts = []
    for block in content:
        if _block_type(block) == "text":
            parts.append(block["text"] if isinstance(block, dict) else block.text)
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


def _tool_uses(content: list[Any]) -> list[tuple[str, str, dict[str, Any]]]:
    uses = []
    for block in content:
        if _block_type(block) == "tool_use":
            if isinstance(block, dict):
                uses.append((block["id"], block["name"], dict(block.get("input") or {})))
            else:
                uses.append((block.id, block.name, dict(block.input or {})))
    return uses


class AgentOrchestrator:
    def __init__(self, ctx: AppContext, clock: Callable[[], float] = time.monotonic):
        self.ctx = ctx
        self.clock = clock

    # --- context ---------------------------------------------------------------
    def _context(self, db: Session, user: User, proposal_id: int | None) -> dict[str, Any]:
        profile = profiles.latest(db, user.id)
        context: dict[str, Any] = {}
        if profile is None:
            context["profile"] = "none yet"
        else:
            context["tier"] = f"{profile.tier} ({self.ctx.catalog.tier_label(profile.tier)})"
            context["capacity_score"] = profile.capacity_score
            context["willingness_score"] = profile.willingness_score
            context["max_acceptable_loss_pct"] = profile.max_acceptable_loss_pct
            context["profile_status"] = profile.status
        current = None
        if proposal_id is not None:
            candidate = db.get(Proposal, proposal_id)
            if candidate is not None and candidate.user_id == user.id:
                current = candidate
        if current is None:
            current = proposals.latest_open(db, user)
        context["current_proposal"] = f"#{current.id} ({current.status})" if current else "none"
        return context

    def _history(self, db: Session, user: User) -> list[dict[str, Any]]:
        rows = db.scalars(
            select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(HISTORY_MESSAGES)
        ).all()
        history = [{"role": r.role, "content": r.content} for r in reversed(rows) if r.content]
        while history and history[0]["role"] != "user":
            history.pop(0)
        return history

    # --- the turn --------------------------------------------------------------
    def respond(
        self, db: Session, user: User, message: str, proposal_id: int | None, on_event: Event | None = None
    ) -> TurnResult:
        emit = on_event or (lambda _e: None)
        tracer = Tracer()
        signals = threats.scan(message)
        root_attrs = {"gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": AGENT_NAME}
        with tracer.span(f"invoke_agent {AGENT_NAME}", **root_attrs) as root:
            if signals:
                root.set(**{"aegis.threat.signals": [sig["id"] for sig in signals]})
            result = self._respond(db, user, message, proposal_id, emit, tracer)
            root.set(**{"aegis.mode": result.mode, "aegis.grounding": result.grounding, **result.usage})
        result.trace = tracer.export()
        result.signals = signals
        result.latency_ms = round(tracer.spans[0].duration_ms, 1)
        return result

    def _respond(self, db: Session, user: User, message: str, proposal_id: int | None, emit: Event, tracer: Tracer) -> TurnResult:
        if controls.advisor_suspended(db):
            emit({"type": "status", "text": "The advisor is paused by compliance"})
            return TurnResult(reply=SUSPENDED_REPLY, mode="suspended", grounding="fallback", fallback_reason="suspended")
        broker = PermissionBroker(ToolContext(db=db, ctx=self.ctx, user=user), tracer)
        context = self._context(db, user, proposal_id)
        if self.ctx.llm is None:
            return self._fallback(db, user, broker, message, proposal_id, emit, reason="no_model", tracer=tracer)
        usage: dict[str, int] = {}
        try:
            return self._model_turn(db, user, broker, message, proposal_id, context, emit, tracer, usage)
        except MODEL_ERRORS as exc:
            log.warning("Model call failed, using fallback: %s", type(exc).__name__)
            result = self._fallback(db, user, broker, message, proposal_id, emit, reason=type(exc).__name__, tracer=tracer)
            result.usage = usage
            return result

    def _model_turn(
        self,
        db: Session,
        user: User,
        broker: PermissionBroker,
        message: str,
        proposal_id: int | None,
        context: dict[str, Any],
        emit: Event,
        tracer: Tracer,
        usage: dict[str, int],
    ) -> TurnResult:
        deadline = self.clock() + TURN_BUDGET_SECONDS
        served_model: str | None = None

        def fallback_now(reason: str) -> TurnResult:
            result = self._fallback(db, user, broker, message, proposal_id, emit, reason=reason, tracer=tracer)
            result.usage, result.served_model = usage, served_model
            return result

        messages: list[dict[str, Any]] = [
            *self._history(db, user),
            {"role": "user", "content": f"{context_block(context)}\n\n{message}"},
        ]
        context_source = [("context", context)]
        rounds = 0
        regenerated = False
        while True:
            remaining = deadline - self.clock()
            if remaining <= 0:
                return fallback_now("timeout")
            emit({"type": "status", "text": "Thinking" if rounds == 0 else "Reading tool results"})
            model = self.ctx.settings.model
            chat_attrs = {"gen_ai.operation.name": "chat", "gen_ai.provider.name": "anthropic", "gen_ai.request.model": model}
            with tracer.span(f"chat {model}", **chat_attrs) as span:
                response = self.ctx.llm.create(messages=messages, timeout=remaining)
                stop = getattr(response, "stop_reason", None)
                served = getattr(response, "model", None)
                served_model = served if isinstance(served, str) else served_model
                tokens = usage_of(response)
                for key, value in tokens.items():
                    usage[key] = usage.get(key, 0) + value
                span.set(**{"gen_ai.response.finish_reasons": [str(stop)], "gen_ai.response.model": served_model, **tokens})
            content = list(getattr(response, "content", []) or [])

            if stop in ("tool_use", "pause_turn"):
                rounds += 1
                if rounds > MAX_TOOL_ROUNDS:
                    return fallback_now("tool_rounds")
                messages.append({"role": "assistant", "content": echo_content(content)})
                if stop == "pause_turn":
                    continue
                results = []
                for tool_use_id, name, args in _tool_uses(content):
                    outcome = broker.run(name, args, call_id=tool_use_id)
                    emit({"type": "tool", "call": outcome.public(), "card": card_for(outcome, self.ctx.catalog)})
                    block: dict[str, Any] = {"type": "tool_result", "tool_use_id": tool_use_id, "content": outcome.for_model()}
                    if outcome.is_error:
                        block["is_error"] = True
                    results.append(block)
                messages.append({"role": "user", "content": results})
                continue

            if stop == "end_turn":
                draft = _text_of(content)
                emit({"type": "status", "text": "Checking every number against the tool results"})
                tool_results = [(o.tool, o.result) for o in broker.outcomes if o.result is not None]
                with tracer.span("aegis.grounding", **{"aegis.attempt": 2 if regenerated else 1}) as span:
                    check = check_reply(draft, tool_results + context_source, message)
                    span.set(
                        **{
                            "aegis.grounding.passed": bool(draft and check.passed),
                            "aegis.grounding.figures_traced": len(check.number_sources),
                            "aegis.grounding.unsupported": len(check.unsupported),
                            "aegis.grounding.banned": len(check.banned),
                        }
                    )
                if draft and check.passed:
                    return TurnResult(
                        reply=draft,
                        mode="model",
                        grounding="regenerated" if regenerated else "passed",
                        tool_calls=[o.public() for o in broker.outcomes],
                        citations=[c for c in check.citations if c["tool"] != "context"],
                        cards=cards_for(broker.outcomes, self.ctx.catalog),
                        number_sources=check.number_sources,
                        proposals_made=_proposals_made(broker),
                        usage=usage,
                        served_model=served_model,
                    )
                if regenerated or not draft:
                    logs.add_now(
                        db,
                        user_id=user.id,
                        actor="system",
                        action="grounding_fallback",
                        decision="denied",
                        detail={"unsupported": check.unsupported, "banned": check.banned},
                    )
                    return fallback_now("grounding")
                regenerated = True
                logs.add_now(
                    db,
                    user_id=user.id,
                    actor="system",
                    action="grounding_regenerated",
                    decision="denied",
                    detail={"unsupported": check.unsupported, "banned": check.banned},
                )
                emit({"type": "status", "text": "Rewriting an unsupported figure"})
                # The failed draft is not sent back; an operator note follows the last user turn instead.
                messages.append({"role": "system", "content": REGENERATE_NOTE.format(problem=check.problem())})
                continue

            # refusal (after server-side fallbacks), max_tokens, or anything unexpected.
            return fallback_now(str(stop))

    def _fallback(
        self,
        db: Session,
        user: User,
        broker: PermissionBroker,
        message: str,
        proposal_id: int | None,
        emit: Event,
        reason: str,
        tracer: Tracer | None = None,
    ) -> TurnResult:
        emit({"type": "status", "text": "Answering from a checked template"})
        before = len(broker.outcomes)
        tracer = tracer or Tracer()
        with tracer.span("aegis.template", **{"aegis.fallback.reason": reason}) as span:
            reply = fallback.answer(broker, message, proposal_id)
            check = fallback.grounding_for(broker, reply, message)
            span.set(**{"aegis.grounding.figures_traced": len(check.number_sources)})
        for outcome in broker.outcomes[before:]:
            emit({"type": "tool", "call": outcome.public(), "card": card_for(outcome, self.ctx.catalog)})
        log.info("Fallback answer (%s)", reason)
        return TurnResult(
            reply=reply,
            mode="fallback",
            grounding="fallback",
            tool_calls=[o.public() for o in broker.outcomes],
            citations=check.citations,
            cards=cards_for(broker.outcomes, self.ctx.catalog),
            number_sources=check.number_sources,
            proposals_made=_proposals_made(broker),
            fallback_reason=reason,
        )
