"""Chat turns (FR-6.1, FR-6.5): run the agent, save both messages, return the checked reply.

Each turn also writes one `agent_turn` entry to the operation log (an
addition): its mode, the tools it called with their tier and decision, the
proposals it made with the gate's verdict, and how many figures were traced.
The compliance Control Room reads its live feed from these entries.

Additions for AI governance:
- Provenance. Every reply carries its label (AI-generated, automated template
  or system notice), the model that served it, the configuration fingerprint
  and the SHA-256 of its text: the explicit and machine-readable labels that
  China's AI-content labelling measures and the EU AI Act (Art. 50) ask for.
- The `agent_turn` entry also keeps the turn's trace, the message's threat
  signals, token use and latency, for the review queue and the turn inspector.
- Client feedback on a reply is logged; a thumbs-down flags the turn for review.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.fingerprint import config_fingerprint, sha256
from app.agent.orchestrator import AgentOrchestrator, Event, TurnResult
from app.core.errors import ApiError
from app.core.timeutil import iso, utcnow
from app.models import ChatMessage, OperationLog, Proposal, User
from app.services import logs
from app.services.context import AppContext

LABELS = {"model": "AI-generated", "fallback": "Automated template (checked)", "suspended": "System notice"}
STANDARDS = ["CN Measures for Labelling AI-Generated Synthetic Content (2025)", "EU AI Act Art. 50"]


def feedback_by_message(db: Session, user_id: int) -> dict[int, dict[str, Any]]:
    """The latest rating the client gave each reply."""
    rows = db.scalars(
        select(OperationLog)
        .where(OperationLog.user_id == user_id, OperationLog.action == "chat_feedback")
        .order_by(OperationLog.id)
    ).all()
    out: dict[int, dict[str, Any]] = {}
    for row in rows:
        detail = row.detail or {}
        if "message_id" in detail:
            out[int(detail["message_id"])] = {"rating": detail.get("rating"), "reason": detail.get("reason"), "at": iso(row.ts)}
    return out


def to_schema(row: ChatMessage, feedback: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"message_id": row.id, "role": row.role, "content": row.content, "created_at": iso(row.created_at)}
    if row.role == "assistant":
        out.update(
            mode=row.mode,
            grounding=row.grounding,
            tool_calls=row.tool_calls or [],
            citations=row.citations or [],
            cards=row.cards or [],
            number_sources=row.number_sources or [],
            provenance=row.provenance,
            feedback=(feedback or {}).get(row.id, {}).get("rating"),
        )
    return out


def history(db: Session, user: User, limit: int) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(limit)
    ).all()
    feedback = feedback_by_message(db, user.id)
    return [to_schema(r, feedback) for r in reversed(rows)]


def provenance(ctx: AppContext, result: TurnResult, created_at: Any) -> dict[str, Any]:
    by_model = result.mode == "model"
    return {
        "label": LABELS[result.mode],
        "ai_generated": by_model,
        "generator": "Aegis advisor",
        "provider": "Anthropic" if by_model else None,
        "model": (result.served_model or ctx.settings.model) if by_model else None,
        "mode": result.mode,
        "config_fingerprint": config_fingerprint(ctx),
        "content_sha256": sha256(result.reply),
        "created_at": iso(created_at),
        "standards": STANDARDS,
    }


def _turn_detail(result: TurnResult, message_id: int, fingerprint: str) -> dict[str, Any]:
    return {
        "message_id": message_id,
        "mode": result.mode,
        "grounding": result.grounding,
        "tools": [{"tool": t["tool"], "tier": t["tier"], "decision": t["decision"]} for t in result.tool_calls],
        "proposals": result.proposals_made,
        "figures_traced": len(result.number_sources),
        "cards": [c["type"] for c in result.cards],
        # Additions for supervision: why a template answered, what served the turn, and how it ran.
        "fallback_reason": result.fallback_reason,
        "served_model": result.served_model,
        "config_fingerprint": fingerprint,
        "latency_ms": result.latency_ms,
        "usage": result.usage,
        "signals": result.signals,
        "trace": result.trace,
    }


def turn(
    db: Session, ctx: AppContext, user: User, message: str, proposal_id: int | None, on_event: Event | None = None
) -> dict[str, Any]:
    if proposal_id is not None:
        proposal = db.get(Proposal, proposal_id)
        if proposal is None:
            raise ApiError(404, "NOT_FOUND", "There is no proposal with this id.")
        if proposal.user_id != user.id:
            raise ApiError(403, "FORBIDDEN", "This proposal belongs to another client.")
    # The agent reads earlier history first; both messages of this turn are saved together afterwards.
    result = AgentOrchestrator(ctx).respond(db, user, message, proposal_id, on_event)
    now = utcnow()
    label = provenance(ctx, result, now)
    db.add(ChatMessage(user_id=user.id, proposal_id=proposal_id, role="user", content=message, created_at=now))
    reply = ChatMessage(
        user_id=user.id,
        proposal_id=proposal_id,
        role="assistant",
        content=result.reply,
        tool_calls=result.tool_calls,
        citations=result.citations,
        cards=result.cards,
        number_sources=result.number_sources,
        provenance=label,
        grounding=result.grounding,
        mode=result.mode,
        created_at=now,
    )
    db.add(reply)
    db.flush()
    logs.add(
        db,
        user_id=user.id,
        actor="agent",
        action="agent_turn",
        detail=_turn_detail(result, reply.id, label["config_fingerprint"]),
    )
    db.commit()
    return {
        "message_id": reply.id,
        "mode": result.mode,
        "grounding": result.grounding,
        "reply": result.reply,
        "tool_calls": result.tool_calls,
        "citations": result.citations,
        "cards": result.cards,
        "number_sources": result.number_sources,
        "provenance": label,
        "created_at": iso(reply.created_at),
    }


def rate(db: Session, user: User, message_id: int, rating: str, reason: str | None) -> dict[str, Any]:
    """The client's thumbs-up or thumbs-down on one of their own replies; the latest rating counts."""
    row = db.get(ChatMessage, message_id)
    if row is None or row.role != "assistant":
        raise ApiError(404, "NOT_FOUND", "There is no reply with this id.")
    if row.user_id != user.id:
        raise ApiError(403, "FORBIDDEN", "This reply belongs to another client.")
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="chat_feedback",
        decision="allowed",
        detail={"message_id": message_id, "rating": rating, "reason": reason or None},
    )
    db.commit()
    return {"message_id": message_id, "rating": rating}
