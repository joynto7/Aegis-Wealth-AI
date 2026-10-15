"""Chat turns (FR-6.1, FR-6.5): run the agent, save both messages, return the checked reply."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.orchestrator import AgentOrchestrator, Event
from app.core.errors import ApiError
from app.core.timeutil import iso
from app.models import ChatMessage, Proposal, User
from app.services.context import AppContext


def to_schema(row: ChatMessage) -> dict[str, Any]:
    out: dict[str, Any] = {"message_id": row.id, "role": row.role, "content": row.content, "created_at": iso(row.created_at)}
    if row.role == "assistant":
        out.update(mode=row.mode, grounding=row.grounding, tool_calls=row.tool_calls or [], citations=row.citations or [])
    return out


def history(db: Session, user: User, limit: int) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(limit)
    ).all()
    return [to_schema(r) for r in reversed(rows)]


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
    db.add(ChatMessage(user_id=user.id, proposal_id=proposal_id, role="user", content=message))
    reply = ChatMessage(
        user_id=user.id,
        proposal_id=proposal_id,
        role="assistant",
        content=result.reply,
        tool_calls=result.tool_calls,
        citations=result.citations,
        grounding=result.grounding,
        mode=result.mode,
    )
    db.add(reply)
    db.commit()
    return {
        "message_id": reply.id,
        "mode": result.mode,
        "grounding": result.grounding,
        "reply": result.reply,
        "tool_calls": result.tool_calls,
        "citations": result.citations,
        "created_at": iso(reply.created_at),
    }
