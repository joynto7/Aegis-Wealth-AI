"""Advice records and chain verification (FR-8.1, FR-8.2)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.timeutil import iso
from app.engines.chain import first_broken
from app.models import AdviceRecord, User
from app.services import logs


def to_schema(record: AdviceRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "user_id": record.user_id,
        "proposal_id": record.proposal_id,
        "content": record.content,
        "prev_hash": record.prev_hash,
        "hash": record.hash,
        "created_at": iso(record.created_at),
    }


def summary(record: AdviceRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "proposal_id": record.proposal_id,
        "date": iso(record.created_at),
        "decision": record.content["gate"]["decision"],
        "amount": record.content["proposal"]["amount"],
        "short_hash": record.hash[:10],
    }


def list_for(db: Session, user: User) -> list[AdviceRecord]:
    query = select(AdviceRecord).order_by(AdviceRecord.id.desc())
    if user.role != "compliance":
        query = query.where(AdviceRecord.user_id == user.id)
    return list(db.scalars(query).all())


def get_visible(db: Session, user: User, record_id: int) -> AdviceRecord:
    record = db.get(AdviceRecord, record_id)
    if record is None:
        raise ApiError(404, "NOT_FOUND", "There is no advice record with this id.")
    if user.role != "compliance" and record.user_id != user.id:
        raise ApiError(403, "FORBIDDEN", "This advice record belongs to another client.")
    return record


def verify(db: Session, user: User, scope: str) -> dict[str, Any]:
    """Walks each client's chain in id order and reports the first record whose stored hash differs."""
    if scope == "all" and user.role != "compliance":
        raise ApiError(403, "FORBIDDEN", "Only the compliance officer can verify every client's chain.")
    query = select(AdviceRecord).order_by(AdviceRecord.user_id, AdviceRecord.id)
    if scope != "all":
        query = query.where(AdviceRecord.user_id == user.id)
    by_user: dict[int, list[AdviceRecord]] = {}
    for record in db.scalars(query):
        by_user.setdefault(record.user_id, []).append(record)
    checked, broken = 0, None
    for chain in by_user.values():
        n, broken_id = first_broken((r.id, r.hash, r.content) for r in chain)
        checked += n
        if broken_id is not None:
            broken = broken_id
            break
    result = {"valid": broken is None, "checked": checked, "broken_record_id": broken}
    logs.add_now(
        db,
        user_id=user.id,
        actor=logs.actor_of(user),
        action="chain_verified",
        decision="allowed",
        detail={"scope": scope, **result},
    )
    return result
