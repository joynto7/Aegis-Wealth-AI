"""Operation log (Section 2.5.12): every material action writes one append-only entry."""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutil import iso
from app.models import OperationLog, User


def actor_of(user: User) -> str:
    return "compliance" if user.role == "compliance" else "client"


def add(
    db: Session,
    *,
    user_id: int | None,
    actor: str,
    action: str,
    tool: str | None = None,
    tier: str | None = None,
    decision: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Adds an entry to the current transaction; it lands with the change it describes."""
    db.add(
        OperationLog(user_id=user_id, actor=actor, action=action, tool=tool, tier=tier, decision=decision, detail=detail or {})
    )


def add_now(db: Session, **kwargs: Any) -> None:
    """Records an entry immediately, e.g. for a denied action whose request then fails."""
    add(db, **kwargs)
    db.commit()


def to_schema(row: OperationLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "ts": iso(row.ts),
        "user_id": row.user_id,
        "actor": row.actor,
        "action": row.action,
        "tool": row.tool,
        "tier": row.tier,
        "decision": row.decision,
        "detail": row.detail or {},
    }


def page(
    db: Session,
    user: User,
    *,
    actor: str | None,
    action: str | None,
    decision: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    query = select(OperationLog)
    if user.role != "compliance":
        query = query.where(OperationLog.user_id == user.id)
    if actor:
        query = query.where(OperationLog.actor == actor)
    if action:
        query = query.where(OperationLog.action == action)
    if decision:
        query = query.where(OperationLog.decision == decision)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(OperationLog.id.desc()).limit(limit).offset(offset)).all()
    return {"items": [to_schema(r) for r in rows], "total": total}


EXPORT_COLUMNS = ("id", "ts", "user_id", "actor", "action", "tool", "tier", "decision", "detail")


def export(db: Session, fmt: str) -> tuple[str, str, str]:
    """Returns (body, media type, file name) for the whole log, oldest first."""
    rows = [to_schema(r) for r in db.scalars(select(OperationLog).order_by(OperationLog.id)).all()]
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(EXPORT_COLUMNS)
        for r in rows:
            writer.writerow(
                [json.dumps(r[c], sort_keys=True) if c == "detail" else ("" if r[c] is None else r[c]) for c in EXPORT_COLUMNS]
            )
        return buf.getvalue(), "text/csv; charset=utf-8", "operation_log.csv"
    return json.dumps(rows, indent=2, ensure_ascii=False), "application/json", "operation_log.json"
