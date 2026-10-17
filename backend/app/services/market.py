"""The simulated market (addition): the clock's state, and the compliance officer's control to move it.

The clock is one row per database (market_clock). Advancing it replays the next months of the illustrative history
(engines/market.py) and writes every product's new NAV and date to the products table, so positions are valued, and
new orders filled, at the simulated price. Only the compliance role can advance it, 1 to 12 months at a time, always
with a reason, and each advance is an operation-log entry. Clients see the clock's date and moves, not who moved it
or why. Nothing trades when the clock moves: drift is measured when a screen asks (services/monitoring.py).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import validation_error
from app.core.timeutil import iso, utcnow
from app.engines import market as engine
from app.engines.catalog import thaw
from app.models import MarketClock, Product, User
from app.services import logs
from app.services.context import AppContext

CLOCK_ID = 1


def _config(ctx: AppContext) -> dict[str, Any]:
    return thaw(ctx.catalog.market)


def start_index(ctx: AppContext) -> int:
    return engine.replay_start(ctx.catalog.history, str(ctx.catalog.market["replay_from"]))


def current_month(db: Session) -> int:
    row = db.get(MarketClock, CLOCK_ID)
    return row.month if row else 0


def state(db: Session, ctx: AppContext, viewer: User | None = None) -> dict[str, Any]:
    config = _config(ctx)
    row = db.get(MarketClock, CLOCK_ID)
    month = row.month if row else 0
    out = {
        **engine.describe(ctx.catalog.history, start=start_index(ctx), months=month, start_date=config["start_date"]),
        "start_date": config["start_date"],
        "replay_from": config["replay_from"],
        "max_months_per_advance": int(config["max_months_per_advance"]),
        "changed_at": iso(row.updated_at) if row else None,
        "changed_by": None,
        "reason": None,
        "data_label": f"{config['data_label']}: replays the synthetic monthly history; not a forecast",
        "note": config["note"],
    }
    if viewer is not None and viewer.role == "compliance" and row is not None:
        changer = db.get(User, row.updated_by)
        out.update(changed_by=changer.display_name if changer else None, reason=row.reason)
    return out


def apply_navs(db: Session, ctx: AppContext, month: int) -> None:
    """Writes every product's NAV and NAV date for the given month."""
    navs = engine.navs(ctx.catalog.products, ctx.catalog.history, start_index(ctx), month)
    as_of = engine.market_date(str(ctx.catalog.market["start_date"]), month)
    for product in db.scalars(select(Product)):
        if product.code in navs:
            product.nav, product.nav_date = navs[product.code], as_of


def advance(db: Session, ctx: AppContext, user: User, months: int, reason: str) -> dict[str, Any]:
    limit = int(ctx.catalog.market["max_months_per_advance"])
    if not 1 <= months <= limit:
        raise validation_error(
            f"Advance the market by 1 to {limit} months at a time.", [{"field": "months", "problem": f"must be 1 to {limit}"}]
        )
    row = db.get(MarketClock, CLOCK_ID)
    before = row.month if row else 0
    after = before + months
    if row is None:
        row = MarketClock(id=CLOCK_ID)
        db.add(row)
    row.month, row.reason, row.updated_by, row.updated_at = after, reason, user.id, utcnow()
    apply_navs(db, ctx, after)
    start = start_index(ctx)
    replayed = [engine.applied_month(ctx.catalog.history, start, step).month for step in range(before + 1, after + 1)]
    moved = engine.describe(ctx.catalog.history, start=start, months=after, start_date=str(ctx.catalog.market["start_date"]))
    logs.add(
        db,
        user_id=user.id,
        actor="compliance",
        action="market_advanced",
        decision="allowed",
        detail={
            "from_month": before,
            "to_month": after,
            "as_of": moved["as_of"],
            "replayed": replayed,
            "since_start_pct": moved["since_start_pct"],
            "reason": reason,
        },
    )
    db.commit()
    return state(db, ctx, user)


def navs_now(db: Session) -> dict[str, float]:
    """Every product's current NAV, as stored."""
    return {p.code: p.nav for p in db.scalars(select(Product))}


def nav_dates_now(db: Session) -> dict[str, tuple[float, str]]:
    return {p.code: (p.nav, p.nav_date) for p in db.scalars(select(Product))}
