"""Supervisory review (addition): the AI turns a person should look at, and the officer's decision on each.

The SFC's circular on generative AI treats investment advice by an AI model as
a high-risk use that needs human review and continuous monitoring; FINRA's 2026
report asks firms to review prompts and outputs over time. Aegis flags a turn
for review when:

- the client's message raised a medium or high threat signal;
- the permission broker blocked a tool call;
- the gate rejected a proposal the AI made;
- the reply failed the number check (rewritten, or replaced by a template);
- the client marked the reply as unhelpful.

The officer clears or escalates a flagged turn with a note. Each decision is an
append-only `review_decided` log entry, so the queue is a view over the log
rather than a table anyone can edit, and the latest decision counts.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.timeutil import iso
from app.models import ChatMessage, OperationLog, User
from app.services import logs

SEVERITY = {"high": 3, "medium": 2, "low": 1}
SCAN_TURNS = 500


def flags_for(detail: dict[str, Any], feedback: dict[str, Any] | None) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    for signal in detail.get("signals") or []:
        if signal.get("severity") in ("medium", "high"):
            flags.append({"kind": "threat", "text": f"Threat signal: {signal['label']}", "severity": signal["severity"]})
    for tool in detail.get("tools") or []:
        if tool.get("decision") == "denied":
            flags.append({"kind": "blocked", "text": f"Broker blocked {tool['tool']} ({tool['tier']})", "severity": "high"})
    for made in detail.get("proposals") or []:
        if made.get("gate") == "REJECT":
            flags.append(
                {"kind": "gate", "text": f"AI proposal #{made['proposal_id']} rejected by the gate", "severity": "medium"}
            )
    if detail.get("grounding") == "regenerated":
        flags.append({"kind": "grounding", "text": "Reply rewritten after the number check", "severity": "low"})
    if detail.get("fallback_reason") == "grounding":
        flags.append({"kind": "grounding", "text": "Template used after two failed number checks", "severity": "medium"})
    if feedback and feedback.get("rating") == "down":
        reason = f": {feedback['reason']}" if feedback.get("reason") else ""
        flags.append({"kind": "feedback", "text": f"Client marked the reply unhelpful{reason}", "severity": "medium"})
    return flags


def _decisions(db: Session) -> dict[int, OperationLog]:
    rows = db.scalars(select(OperationLog).where(OperationLog.action == "review_decided").order_by(OperationLog.id)).all()
    return {int((r.detail or {})["turn_log_id"]): r for r in rows if "turn_log_id" in (r.detail or {})}


def _feedback(db: Session) -> dict[int, dict[str, Any]]:
    rows = db.scalars(select(OperationLog).where(OperationLog.action == "chat_feedback").order_by(OperationLog.id)).all()
    out: dict[int, dict[str, Any]] = {}
    for row in rows:
        d = row.detail or {}
        if "message_id" in d:
            out[int(d["message_id"])] = {"rating": d.get("rating"), "reason": d.get("reason"), "at": iso(row.ts)}
    return out


def _names(db: Session, ids: set[int | None]) -> dict[int, str]:
    wanted = [i for i in ids if i is not None]
    if not wanted:
        return {}
    return {u.id: u.display_name for u in db.scalars(select(User).where(User.id.in_(wanted)))}


def _client_message(db: Session, turn: OperationLog) -> ChatMessage | None:
    message_id = (turn.detail or {}).get("message_id")
    if message_id is None:
        return None
    return db.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == turn.user_id, ChatMessage.role == "user", ChatMessage.id < int(message_id))
        .order_by(ChatMessage.id.desc())
        .limit(1)
    ).first()


def _decision_fields(decision: OperationLog | None, names: dict[int, str]) -> dict[str, Any]:
    if decision is None:
        return {"decided_by": None, "decided_at": None, "note": None}
    d = decision.detail or {}
    return {"decided_by": names.get(decision.user_id or -1), "decided_at": iso(decision.ts), "note": d.get("note")}


def status_of(flags: list[dict[str, str]], decision: OperationLog | None) -> str | None:
    if not flags:
        return None
    return (decision.detail or {}).get("decision", "open") if decision is not None else "open"


def annotate(db: Session, turns: list[OperationLog]) -> dict[int, tuple[list[dict[str, str]], str | None]]:
    """Flags and review status for each turn, for the Control Room's live feed."""
    decisions, feedback = _decisions(db), _feedback(db)
    out = {}
    for turn in turns:
        d = turn.detail or {}
        flags = flags_for(d, feedback.get(int(d.get("message_id") or 0)))
        out[turn.id] = (flags, status_of(flags, decisions.get(turn.id)))
    return out


def queue(db: Session, status: str, limit: int) -> dict[str, Any]:
    turns = db.scalars(
        select(OperationLog).where(OperationLog.action == "agent_turn").order_by(OperationLog.id.desc()).limit(SCAN_TURNS)
    ).all()
    decisions, feedback = _decisions(db), _feedback(db)
    names = _names(db, {t.user_id for t in turns} | {d.user_id for d in decisions.values()})
    counts = {"open": 0, "cleared": 0, "escalated": 0}
    items = []
    for turn in turns:
        d = turn.detail or {}
        flags = flags_for(d, feedback.get(int(d.get("message_id") or 0)))
        if not flags:
            continue
        decision = decisions.get(turn.id)
        state = status_of(flags, decision) or "open"
        counts[state] += 1
        if status == "all" or state == status or (status == "resolved" and state != "open"):
            message = _client_message(db, turn)
            text = message.content if message else ""
            items.append(
                {
                    "log_id": turn.id,
                    "ts": iso(turn.ts),
                    "user_id": turn.user_id,
                    "client": names.get(turn.user_id or -1),
                    "message_preview": text if len(text) <= 140 else text[:139] + "…",
                    "mode": d.get("mode", "fallback"),
                    "grounding": d.get("grounding", "fallback"),
                    "severity": max((f["severity"] for f in flags), key=lambda s: SEVERITY[s]),
                    "flags": flags,
                    "status": state,
                    **_decision_fields(decision, names),
                }
            )
    return {"items": items[:limit], "counts": counts}


def _turn(db: Session, log_id: int) -> OperationLog:
    turn = db.get(OperationLog, log_id)
    if turn is None or turn.action != "agent_turn":
        raise ApiError(404, "NOT_FOUND", "There is no AI turn with this id.")
    return turn


def turn_detail(db: Session, log_id: int) -> dict[str, Any]:
    turn = _turn(db, log_id)
    d = turn.detail or {}
    reply = db.get(ChatMessage, int(d["message_id"])) if d.get("message_id") else None
    message = _client_message(db, turn)
    feedback = _feedback(db).get(int(d.get("message_id") or 0))
    decision = _decisions(db).get(turn.id)
    flags = flags_for(d, feedback)
    names = _names(db, {turn.user_id, decision.user_id if decision else None})
    return {
        "log_id": turn.id,
        "ts": iso(turn.ts),
        "user_id": turn.user_id,
        "client": names.get(turn.user_id or -1),
        "message": message.content if message else None,
        "reply": reply.content if reply else None,
        "mode": d.get("mode", "fallback"),
        "grounding": d.get("grounding", "fallback"),
        "fallback_reason": d.get("fallback_reason"),
        "served_model": d.get("served_model"),
        "config_fingerprint": d.get("config_fingerprint"),
        "latency_ms": d.get("latency_ms"),
        "usage": d.get("usage") or {},
        "provenance": reply.provenance if reply else None,
        "tools": (reply.tool_calls if reply else None) or [],
        "cards": d.get("cards") or [],
        "proposals": d.get("proposals") or [],
        "figures_traced": int(d.get("figures_traced") or 0),
        "signals": d.get("signals") or [],
        "trace": d.get("trace") or [],
        "flags": flags,
        "status": status_of(flags, decision),
        **_decision_fields(decision, names),
        "feedback": feedback,
    }


def decide(db: Session, officer: User, log_id: int, decision: str, note: str) -> dict[str, Any]:
    turn = _turn(db, log_id)
    d = turn.detail or {}
    if not flags_for(d, _feedback(db).get(int(d.get("message_id") or 0))):
        raise ApiError(409, "STATE_CONFLICT", "This turn raised no review flag.")
    logs.add(
        db,
        user_id=officer.id,
        actor="compliance",
        action="review_decided",
        decision="allowed",
        detail={"turn_log_id": turn.id, "client_id": turn.user_id, "decision": decision, "note": note},
    )
    db.commit()
    return turn_detail(db, log_id)
