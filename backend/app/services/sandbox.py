"""Sandbox account view (FR-7.4): cash, positions valued at NAV, total value and order history."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.numbers import round2, round4
from app.models import Order, Position, SandboxAccount, User
from app.services.execution import order_schema


def account(db: Session, user: User) -> dict[str, Any]:
    acct = db.scalars(select(SandboxAccount).where(SandboxAccount.user_id == user.id)).first()
    if acct is None:
        return {"cash": 0.0, "positions": [], "total_value": 0.0, "data_label": "Simulated"}
    positions = []
    for pos in db.scalars(select(Position).where(Position.account_id == acct.id).order_by(Position.id)):
        if pos.units <= 0:
            continue
        positions.append(
            {
                "product_code": pos.product.code,
                "name": pos.product.name,
                "asset_class": pos.product.asset_class,
                "units": round4(pos.units),
                "avg_nav": round4(pos.avg_nav),
                "value": round2(pos.units * pos.product.nav),
            }
        )
    total = round2(acct.cash + sum(p["value"] for p in positions))
    return {"cash": acct.cash, "positions": positions, "total_value": total, "data_label": "Simulated"}


def orders(db: Session, user: User) -> list[dict[str, Any]]:
    acct = db.scalars(select(SandboxAccount).where(SandboxAccount.user_id == user.id)).first()
    if acct is None:
        return []
    return [order_schema(o) for o in db.scalars(select(Order).where(Order.account_id == acct.id).order_by(Order.id.desc()))]
