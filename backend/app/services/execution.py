"""Confirmation and sandbox execution (Section 2.5.10) - tier T3, reachable only by the client's click.

The agent has no route here: no tool issues or uses a confirmation token.
Execute claims the token with a compare-and-set update, so two concurrent
calls with the same token cannot both place orders. While compliance has
execution halted (addition), neither a token nor an order goes through.

A rebalancing (addition) places its stored trades: the sales first, then the
purchases they fund. It is refused at Confirm and at Execute once the market
has moved or the holdings have changed since it was priced.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import new_confirm_token, sha256_hex
from app.core.timeutil import iso, utcnow
from app.engines.chain import GENESIS_HASH, items_hash, next_hash
from app.engines.gate import failed_rule_ids
from app.engines.numbers import round2, round4, units_for
from app.models import (
    AdviceRecord,
    ConfirmToken,
    Order,
    Position,
    Product,
    Proposal,
    QuizAttempt,
    RebalancePlan,
    SandboxAccount,
    User,
)
from app.services import controls, logs, monitoring, profiles, proposals
from app.services.context import AppContext

TOKEN_TTL = timedelta(minutes=5)
HALTED = "Order execution is paused by the compliance team. Your proposal is saved; try again later."


def _deny(db: Session, user: User, proposal: Proposal, action: str, code: str, status: int, message: str) -> ApiError:
    logs.add_now(
        db,
        user_id=user.id,
        actor="client",
        action=action,
        tier="T3",
        decision="denied",
        detail={"proposal_id": proposal.id, "reason": code},
    )
    return ApiError(status, code, message)


def confirm(db: Session, ctx: AppContext, user: User, proposal: Proposal) -> dict[str, str]:
    if controls.execution_halted(db):
        raise _deny(db, user, proposal, "token_issued", "EXECUTION_HALTED", 409, HALTED)
    if proposal.status == "rejected":
        err = _deny(
            db, user, proposal, "token_issued", "GATE_REJECTED", 409, "This proposal was rejected by the compliance gate."
        )
        err.details = {"rule_ids": failed_rule_ids({"rules": proposal.gate.rules}, "hard")}
        raise err
    if proposal.status == "warning":
        raise _deny(db, user, proposal, "token_issued", "WARNINGS_NOT_ACKNOWLEDGED", 409, "Tick every warning before confirming.")
    if proposal.status not in proposals.CONFIRMABLE:
        raise _deny(db, user, proposal, "token_issued", "STATE_CONFLICT", 409, f"This proposal is {proposal.status}.")
    if proposal.rebalance is not None and monitoring.is_stale(db, proposal.rebalance, user.id):
        raise _deny(db, user, proposal, "token_issued", "STATE_CONFLICT", 409, monitoring.STALE)
    if not proposal.quiz_passed:
        raise _deny(db, user, proposal, "token_issued", "QUIZ_REQUIRED", 409, "Pass the comprehension quiz first.")
    token = new_confirm_token()
    expires_at = utcnow() + TOKEN_TTL
    db.add(
        ConfirmToken(
            proposal_id=proposal.id,
            token_hash=sha256_hex(token),
            items_hash=proposal.items_hash,
            expires_at=expires_at,
        )
    )
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="token_issued",
        tier="T3",
        decision="allowed",
        detail={"proposal_id": proposal.id},
    )
    db.commit()
    return {"confirm_token": token, "expires_at": iso(expires_at)}


def execute(db: Session, ctx: AppContext, user: User, proposal: Proposal, token: str | None) -> dict[str, Any]:
    action = "orders_executed"
    if controls.execution_halted(db):
        raise _deny(db, user, proposal, action, "EXECUTION_HALTED", 409, HALTED)
    if not token:
        raise _deny(db, user, proposal, action, "TOKEN_INVALID", 403, "No confirmation token was supplied.")
    row = db.scalars(select(ConfirmToken).where(ConfirmToken.token_hash == sha256_hex(token))).first()
    if row is None or row.proposal_id != proposal.id:
        raise _deny(db, user, proposal, action, "TOKEN_INVALID", 403, "This confirmation token is not valid for this proposal.")
    now = utcnow()
    if now > row.expires_at:
        raise _deny(db, user, proposal, action, "TOKEN_EXPIRED", 403, "This confirmation token has expired. Confirm again.")
    if row.used_at is not None:
        raise _deny(db, user, proposal, action, "TOKEN_USED", 409, "This confirmation token was already used.")
    current = items_hash((it.product.code, it.weight_pct) for it in proposal.items)
    if current != row.items_hash or proposal.status not in proposals.CONFIRMABLE:
        raise _deny(db, user, proposal, action, "STATE_CONFLICT", 409, "This proposal changed or closed since you confirmed it.")
    plan = proposal.rebalance
    if plan is not None and monitoring.is_stale(db, plan, user.id):
        raise _deny(db, user, proposal, action, "STATE_CONFLICT", 409, monitoring.STALE)
    account = db.scalars(select(SandboxAccount).where(SandboxAccount.user_id == user.id)).first()
    need = plan.totals["buy_total"] - plan.totals["sell_total"] if plan is not None else proposal.amount
    if account is None or account.cash < need:
        raise _deny(db, user, proposal, action, "INSUFFICIENT_CASH", 409, "Your sandbox account no longer holds enough cash.")

    # Single use: only one caller can flip used_at from NULL.
    claimed = db.execute(
        update(ConfirmToken).where(ConfirmToken.id == row.id, ConfirmToken.used_at.is_(None)).values(used_at=now)
    ).rowcount
    if claimed != 1:
        db.rollback()
        raise _deny(db, user, proposal, action, "TOKEN_USED", 409, "This confirmation token was already used.")

    if plan is None:
        orders = [
            _fill(db, account, proposal, it.product, "buy", it.amount, units_for(it.amount, it.product.nav), now)
            for it in proposal.items
        ]
    else:
        orders = _rebalance(db, account, proposal, plan, now)
    db.add_all(orders)
    proposal.status = "executed"
    db.flush()

    order_dicts = [order_schema(o) for o in orders]
    record = _create_record(db, ctx, user, proposal, order_dicts, consent_at=iso(now))
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action=action,
        tier="T3",
        decision="allowed",
        detail={
            "proposal_id": proposal.id,
            "order_ids": [o.id for o in orders],
            "cash_after": account.cash,
            "rebalance": plan is not None,
        },
    )
    logs.add(db, user_id=user.id, actor="system", action="record_created", detail={"record_id": record.id, "hash": record.hash})
    db.commit()
    return {
        "proposal_id": proposal.id,
        "status": "executed",
        "orders": order_dicts,
        "cash_after": account.cash,
        "record_id": record.id,
    }


def _fill(
    db: Session,
    account: SandboxAccount,
    proposal: Proposal,
    product: Product,
    side: str,
    amount: float,
    units: float,
    now: datetime,
) -> Order:
    """One filled order at the product's current NAV: a purchase adds units and spends cash, a sale does the reverse."""
    nav = product.nav
    cost = round2(units * nav)
    position = db.scalars(select(Position).where(Position.account_id == account.id, Position.product_id == product.id)).first()
    if side == "sell":
        position.units = round4(max(0.0, position.units - units))
        account.cash = round2(account.cash + cost)
    elif position is None:
        db.add(Position(account_id=account.id, product_id=product.id, units=units, avg_nav=nav))
        account.cash = round2(account.cash - cost)
    else:
        total_units = position.units + units
        position.avg_nav = (position.units * position.avg_nav + units * nav) / total_units
        position.units = round4(total_units)
        account.cash = round2(account.cash - cost)
    return Order(
        account_id=account.id,
        proposal_id=proposal.id,
        product=product,
        amount=amount,
        units=units,
        nav=nav,
        cost=cost,
        status="filled",
        side=side,
        created_at=now,
    )


def _rebalance(db: Session, account: SandboxAccount, proposal: Proposal, plan: RebalancePlan, now: datetime) -> list[Order]:
    """The stored trades, sales first: they fund the purchases."""
    codes = [t["product_code"] for t in plan.trades]
    products = {p.code: p for p in db.scalars(select(Product).where(Product.code.in_(codes)))}
    ordered = sorted(plan.trades, key=lambda t: t["side"] != "sell")
    return [
        _fill(db, account, proposal, products[t["product_code"]], t["side"], float(t["amount"]), float(t["units"]), now)
        for t in ordered
    ]


def order_schema(order: Order) -> dict[str, Any]:
    return {
        "id": order.id,
        "product_code": order.product.code if order.product else "",
        "amount": order.amount,
        "units": order.units,
        "nav": order.nav,
        "cost": order.cost,
        "status": order.status,
        "created_at": iso(order.created_at),
        "side": order.side or "buy",
    }


def _create_record(
    db: Session, ctx: AppContext, user: User, proposal: Proposal, orders: list[dict[str, Any]], consent_at: str
) -> AdviceRecord:
    """Section 2.5.11: profile, proposal, gate, quiz, disclosures, consent and orders, chained to the last record."""
    profile = profiles.latest(db, user.id)
    attempt = db.scalars(
        select(QuizAttempt).where(QuizAttempt.proposal_id == proposal.id).order_by(QuizAttempt.id.desc()).limit(1)
    ).first()
    proposal_doc = proposals.to_schema(proposal, ctx)
    content = {
        "profile": {
            "version": profile.version,
            "tier": profile.tier,
            "capacity_score": profile.capacity_score,
            "willingness_score": profile.willingness_score,
            "replay_adjustment": profile.replay_adjustment,
        },
        "proposal": proposal_doc,
        "gate": proposal_doc["gate"],
        "quiz": {"passed": attempt.passed, "results": attempt.results} if attempt else {"passed": False, "results": []},
        "disclosures": [{"id": d["id"], "version": d["version"]} for d in ctx.catalog.disclosures],
        "consent_at": consent_at,
        "orders": orders,
    }
    previous = db.scalars(
        select(AdviceRecord).where(AdviceRecord.user_id == user.id).order_by(AdviceRecord.id.desc()).limit(1)
    ).first()
    prev_hash = previous.hash if previous else GENESIS_HASH
    record = AdviceRecord(
        user_id=user.id, proposal_id=proposal.id, content=content, prev_hash=prev_hash, hash=next_hash(prev_hash, content)
    )
    db.add(record)
    db.flush()
    return record
