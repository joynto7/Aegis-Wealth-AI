"""The monitoring loop (addition): drift of each client's live portfolio, alerts, and rebalancing proposals.

1. Target: the latest executed proposal, the mix the client last agreed to. Once a rebalancing executes, it becomes
   the target, with the same weights.
2. Drift: live class and product weights at the simulated NAVs against that target (engines/drift.py), with the band
   from rules.json. The full gate also runs on the live weights, with the client's current profile, to find rules the
   holdings now fail (R-03 after an equity rally, R-05 at the short-horizon cap).
3. Surfaces: the client's view with the trades a rebalancing would place now, the briefing insight, the officer's
   overview and the Control Room alerts. Everything is computed when asked; nothing runs in the background.
4. Rebalancing: a new version of the executed proposal, with its weights at the live value. Code builds the trades
   (engines/rebalance.py), and the gate checks the version against the client's current tier like any
   recommendation (HK SFC robo-advice guidelines, Ch. 4). How to fix applies when it fails. It is priced at one market
   month and one set of holdings; once either changes it can no longer be revised, confirmed or executed
   (STATE_CONFLICT), and a fresh one replaces it.
5. Execution stays the client's: the quiz, the Confirm click and the one-time token (services/execution.py). No tool,
   job or switch rebalances on its own.
"""

from __future__ import annotations

import hashlib
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.core.errors import ApiError
from app.engines import drift as drift_engine
from app.engines import market as market_engine
from app.engines import rebalance as rebalance_engine
from app.engines.allocation import class_weights_of
from app.engines.chain import canonical
from app.engines.gate import evaluate_gate, failed_rule_ids
from app.engines.metrics import compute_metrics
from app.engines.numbers import format_money, round2, round4
from app.engines.stress import compute_stress
from app.models import Position, Profile, Proposal, RebalancePlan, SandboxAccount, User
from app.services import logs, market, profiles, proposals
from app.services.context import AppContext

DATA_LABEL = "Simulated prices from the illustrative history; gate and stress results are hypothetical"
STALE = "Prices or holdings have changed since this rebalancing was priced. Propose a fresh one from your account."
NOTHING_TO_TRADE = "Your holdings already match the mix you agreed to: there is nothing to trade."
POLICY = (
    "Aegis never rebalances on its own. Drift raises an alert here and a briefing for the client; the client, or the "
    "advisor at tier T2, proposes a rebalancing; the gate checks it against the client's current tier; and only the "
    "client's quiz, Confirm click and one-time token execute it."
)
CLASS_WORDS = {"cash": "cash", "bond": "bond", "gold": "gold", "equity": "equity"}


# --- inputs ---------------------------------------------------------------------------
def target_proposal(db: Session, user_id: int) -> Proposal | None:
    """The latest executed proposal: the mix the client last agreed to."""
    return db.scalars(
        select(Proposal).where(Proposal.user_id == user_id, Proposal.status == "executed").order_by(Proposal.id.desc()).limit(1)
    ).first()


def holdings(db: Session, user_id: int) -> tuple[list[dict[str, Any]], float]:
    """The client's positions at the current NAVs, and the account's uninvested cash."""
    acct = db.scalars(select(SandboxAccount).where(SandboxAccount.user_id == user_id)).first()
    if acct is None:
        return [], 0.0
    out = []
    for pos in db.scalars(select(Position).where(Position.account_id == acct.id).order_by(Position.id)):
        if pos.units <= 0:
            continue
        p = pos.product
        out.append(
            {
                "product_code": p.code,
                "name": p.name,
                "asset_class": p.asset_class,
                "units": round4(pos.units),
                "nav": p.nav,
                "value": round2(pos.units * p.nav),
            }
        )
    return out, acct.cash


def holdings_hash(held: list[dict[str, Any]]) -> str:
    pairs = sorted([h["product_code"], float(h["units"])] for h in held)
    return hashlib.sha256(canonical(pairs).encode("utf-8")).hexdigest()


def live_gate(ctx: AppContext, held: list[dict[str, Any]], target: Proposal, profile: Profile) -> dict[str, Any]:
    """The full gate on the live weights, with today's profile and the target's horizon and near-term need."""
    catalog = ctx.catalog
    total = sum(float(h["value"]) for h in held)
    items = [
        {
            "product_code": h["product_code"],
            "name": h["name"],
            "asset_class": h["asset_class"],
            "risk_level": catalog.by_code[h["product_code"]].risk_level,
            "weight_pct": float(h["value"]) / total * 100,
            "amount": float(h["value"]),
            "rationale": "",
        }
        for h in held
    ]
    weights = class_weights_of(items)
    return evaluate_gate(
        items=items,
        class_weights_pct=weights,
        metrics=compute_metrics(items, weights, catalog.history, catalog.by_code),
        stress=compute_stress(weights, total, catalog.scenarios),
        tier=profile.tier,
        amount=total,
        horizon_years=target.horizon_years,
        near_term_need=target.near_term_need,
        max_acceptable_loss_pct=profile.max_acceptable_loss_pct,
        by_code=catalog.by_code,
        thresholds=catalog.thresholds,
    )


# --- assessment ---------------------------------------------------------------------------
def assess(db: Session, ctx: AppContext, user_id: int) -> dict[str, Any] | None:
    """Drift and live rule failures of one client's portfolio; None when there is nothing executed to compare."""
    target = target_proposal(db, user_id)
    held, cash = holdings(db, user_id)
    if target is None or not held:
        return None
    band = float(ctx.catalog.thresholds["drift_band_pp"])
    target_items = proposals.item_dicts(target)
    drift = drift_engine.measure(held, target_items, band_pp=band)
    profile = profiles.latest(db, user_id)
    gate = live_gate(ctx, held, target, profile) if profile is not None else None
    failing: list[dict[str, Any]] = []
    if gate is not None:
        at_confirm = set(failed_rule_ids({"rules": target.gate.rules}))
        for rule in gate["rules"]:
            if rule["result"] == "fail":
                spec = ctx.catalog.rule(rule["id"])
                failing.append(
                    {
                        "id": rule["id"],
                        "name": str(spec["name"]) if spec else rule["id"],
                        "type": rule["type"],
                        "message": rule["message"],
                        "detail": rule["detail"],
                        "new": rule["id"] not in at_confirm,
                    }
                )
    if any(f["type"] == "hard" for f in failing):
        status = "rule_breach"
    elif drift["outside_band"] or any(f["new"] for f in failing):
        status = "drifted"
    else:
        status = "on_target"
    return {
        "target": target,
        "held": held,
        "cash": cash,
        "drift": drift,
        "gate": gate,
        "failing": failing,
        "status": status,
        "target_items": target_items,
    }


def open_rebalance(db: Session, user_id: int) -> Proposal | None:
    """The client's latest rebalancing proposal that is still open."""
    return db.scalars(
        select(Proposal)
        .join(RebalancePlan, RebalancePlan.proposal_id == Proposal.id)
        .where(Proposal.user_id == user_id, Proposal.status.in_(proposals.OPEN_STATUSES))
        .order_by(Proposal.id.desc())
        .limit(1)
    ).first()


def is_stale(db: Session, plan: RebalancePlan, user_id: int) -> bool:
    """True once the market has moved or the holdings have changed since the plan was priced."""
    if plan.market_month != market.current_month(db):
        return True
    return plan.holdings_hash != holdings_hash(holdings(db, user_id)[0])


def _open_summary(db: Session, proposal: Proposal | None) -> dict[str, Any] | None:
    if proposal is None or proposal.rebalance is None:
        return None
    return {
        "proposal_id": proposal.id,
        "version": proposal.version,
        "status": proposal.status,
        "gate_decision": proposal.gate.decision,
        "stale": is_stale(db, proposal.rebalance, proposal.user_id),
    }


# --- views --------------------------------------------------------------------------------
def client_view(db: Session, ctx: AppContext, user: User) -> dict[str, Any]:
    view = assess(db, ctx, user.id)
    band = float(ctx.catalog.thresholds["drift_band_pp"])
    common = {"market": market.state(db, ctx, user), "band_pp": band, "data_label": DATA_LABEL}
    if view is None:
        return {
            **common,
            "status": "none",
            "target_proposal_id": None,
            "target_version": None,
            "total_value": 0.0,
            "classes": [],
            "products": [],
            "largest": None,
            "portfolio_drift_pct": 0.0,
            "outside_band": False,
            "live_gate": None,
            "rules_failing": [],
            "rebalance": None,
            "open_rebalance": None,
        }
    drift, target = view["drift"], view["target"]
    preview = rebalance_engine.plan(
        view["held"], view["target_items"], amount=drift["total_value"], navs=market.navs_now(db), cash=view["cash"]
    )
    return {
        **common,
        "status": view["status"],
        "target_proposal_id": target.id,
        "target_version": target.version,
        "total_value": drift["total_value"],
        "classes": drift["classes"],
        "products": drift["products"],
        "largest": drift["largest"],
        "portfolio_drift_pct": drift["portfolio_drift_pct"],
        "outside_band": drift["outside_band"],
        "live_gate": view["gate"]["decision"] if view["gate"] else None,
        "rules_failing": view["failing"],
        "rebalance": preview,
        "open_rebalance": _open_summary(db, open_rebalance(db, user.id)),
    }


def overview(db: Session, ctx: AppContext, viewer: User) -> dict[str, Any]:
    clients = []
    for client in db.scalars(select(User).where(User.role == "client").order_by(User.id)):
        view = assess(db, ctx, client.id)
        if view is None:
            continue
        clients.append(
            {
                "user_id": client.id,
                "client": client.display_name,
                "status": view["status"],
                "total_value": view["drift"]["total_value"],
                "target_proposal_id": view["target"].id,
                "largest": view["drift"]["largest"],
                "portfolio_drift_pct": view["drift"]["portfolio_drift_pct"],
                "outside_band": view["drift"]["outside_band"],
                "rules_failing": [f["id"] for f in view["failing"]],
                "new_failures": [f["id"] for f in view["failing"] if f["new"]],
                "open_rebalance": _open_summary(db, open_rebalance(db, client.id)),
            }
        )
    counts = {key: sum(1 for c in clients if c["status"] == key) for key in ("on_target", "drifted", "rule_breach")}
    return {
        "market": market.state(db, ctx, viewer),
        "band_pp": float(ctx.catalog.thresholds["drift_band_pp"]),
        "clients": clients,
        "counts": counts,
        "policy": POLICY,
    }


def alerts(db: Session, ctx: AppContext) -> list[dict[str, Any]]:
    """One Control Room alert per client whose live portfolio broke a rule (high) or drifted beyond the band (medium)."""
    out: list[dict[str, Any]] = []
    state = None
    for client in db.scalars(select(User).where(User.role == "client").order_by(User.id)):
        view = assess(db, ctx, client.id)
        if view is None or view["status"] == "on_target":
            continue
        state = state or market.state(db, ctx)
        largest = view["drift"]["largest"]
        cls = next(c for c in view["drift"]["classes"] if c["asset_class"] == largest["asset_class"])
        moved = (
            f"{CLASS_WORDS[cls['asset_class']].capitalize()} is {cls['current_pct']:g}% against a {cls['target_pct']:g}% "
            f"target ({cls['drift_pp']:+g} points; the band is {view['drift']['band_pp']:g})."
        )
        pending = open_rebalance(db, client.id)
        follow = (
            f" Rebalancing proposal #{pending.id} is waiting for the client."
            if pending is not None
            else " No rebalancing has been proposed yet."
        )
        hard = [f for f in view["failing"] if f["type"] == "hard"]
        if hard:
            listed = " and ".join(f"{f['id']} ({f['name']})" for f in hard)
            out.append(
                {
                    "id": f"drift-{client.id}",
                    "severity": "high",
                    "title": "A live portfolio now breaks a rule",
                    "detail": f"Client #{client.id}: {listed} now fails on the holdings at the simulated prices of "
                    f"{state['as_of']}. {moved}{follow}",
                    "since": state["changed_at"],
                }
            )
        else:
            out.append(
                {
                    "id": f"drift-{client.id}",
                    "severity": "medium",
                    "title": "Portfolio drift beyond the band",
                    "detail": f"Client #{client.id}: {moved}{follow}",
                    "since": state["changed_at"],
                }
            )
    return out


def insight(db: Session, ctx: AppContext, user: User) -> dict[str, Any] | None:
    """The briefing's drift insight, once the simulated market has moved and the client holds a portfolio."""
    month = market.current_month(db)
    if month == 0:
        return None
    view = assess(db, ctx, user.id)
    if view is None:
        return None
    drift = view["drift"]
    largest = drift["largest"]
    cls = next(c for c in drift["classes"] if c["asset_class"] == largest["asset_class"])
    words = CLASS_WORDS[cls["asset_class"]]
    figure = f"{cls['drift_pp']:+g} pts"
    label = f"{words} against target"
    href, action = "/account#risk", "Review the drift"
    months = f"{month} simulated month{'s' if month != 1 else ''}"
    if view["status"] == "rule_breach":
        hard = [f for f in view["failing"] if f["type"] == "hard"]
        listed = " and ".join(f"{f['name']} ({f['id']})" for f in hard)
        return {
            "id": "drift",
            "tone": "attention",
            "title": "A rule now fails on what you hold",
            "body": f"After {months}, your holdings fail {listed} at the simulated prices. Rebalancing restores the mix "
            "you agreed to; the gate checks it first and nothing trades until you confirm.",
            "figure": figure,
            "figure_label": label,
            "href": href,
            "action": action,
        }
    if view["status"] == "drifted":
        side = "over" if cls["drift_pp"] > 0 else "under"
        sell = rebalance_engine.plan(
            view["held"], view["target_items"], amount=drift["total_value"], navs=market.navs_now(db), cash=view["cash"]
        )["sell_total"]
        return {
            "id": "drift",
            "tone": "attention",
            "title": "Your portfolio has drifted",
            "body": f"After {months}, your {words} share is {cls['current_pct']:g}% against your {cls['target_pct']:g}% "
            f"target: {abs(cls['drift_pp']):g} points {side}, beyond the {drift['band_pp']:g}-point band. Rebalancing "
            f"would sell about {format_money(sell)}; nothing trades until you confirm.",
            "figure": figure,
            "figure_label": label,
            "href": href,
            "action": action,
        }
    return {
        "id": "drift",
        "tone": "positive",
        "title": "Still on target",
        "body": f"After {months}, every asset class is within {drift['band_pp']:g} points of your target; the largest "
        f"gap is {words} at {cls['drift_pp']:+g} points.",
        "figure": figure,
        "figure_label": label,
        "href": href,
        "action": action,
    }


# --- rebalancing proposals ----------------------------------------------------------------
def rebalance_doc(proposal: Proposal, ctx: AppContext) -> dict[str, Any] | None:
    """A proposal's rebalancing block for the API, or None for an ordinary proposal."""
    plan = proposal.rebalance
    if plan is None:
        return None
    db = object_session(proposal)
    stale = proposal.status in proposals.OPEN_STATUSES and db is not None and is_stale(db, plan, proposal.user_id)
    return {
        "source_proposal_id": plan.source_proposal_id,
        "market_month": plan.market_month,
        "market_as_of": market_engine.market_date(str(ctx.catalog.market["start_date"]), plan.market_month),
        "portfolio_value": plan.portfolio_value,
        "trades": plan.trades,
        **plan.totals,
        "drift_before": plan.drift["classes"],
        "band_pp": float(plan.drift.get("band_pp", ctx.catalog.thresholds["drift_band_pp"])),
        "stale": stale,
    }


def ensure_current(db: Session, proposal: Proposal) -> None:
    """A rebalancing priced before the market moved, or before the holdings changed, can no longer go ahead."""
    if proposal.rebalance is not None and is_stale(db, proposal.rebalance, proposal.user_id):
        raise ApiError(409, "STATE_CONFLICT", STALE)


def _trade_words(trade: dict[str, Any] | None) -> str:
    if trade is None:
        return "no trade needed"
    verb = "sells" if trade["side"] == "sell" else "buys"
    return f"{verb} {trade['units']:,.4f} units ({format_money(trade['amount'], cents=True)}) at NAV {trade['nav']:.4f}"


def _plan_row(
    ctx: AppContext, db: Session, *, source_id: int, held: list[dict[str, Any]], cash: float, items: list[dict[str, Any]]
) -> tuple[RebalancePlan, dict[str, Any], dict[str, Any]]:
    band = float(ctx.catalog.thresholds["drift_band_pp"])
    drift = drift_engine.measure(held, items, band_pp=band)
    plan = rebalance_engine.plan(held, items, amount=drift["total_value"], navs=market.navs_now(db), cash=cash)
    row = RebalancePlan(
        source_proposal_id=source_id,
        market_month=market.current_month(db),
        holdings_hash=holdings_hash(held),
        portfolio_value=drift["total_value"],
        trades=plan["trades"],
        totals={k: plan[k] for k in ("sell_total", "buy_total", "net_cash", "turnover_pct")},
        drift={k: drift[k] for k in ("classes", "largest", "portfolio_drift_pct", "outside_band", "band_pp")},
    )
    return row, plan, drift


def propose(db: Session, ctx: AppContext, user: User, profile: Profile, *, actor: str = "client") -> Proposal:
    """Builds the trades back to target as the next version of the executed proposal; the gate runs on it."""
    target = target_proposal(db, user.id)
    held, cash = holdings(db, user.id)
    if target is None or not held:
        raise ApiError(409, "STATE_CONFLICT", "There is no executed portfolio to rebalance yet.")
    existing = open_rebalance(db, user.id)
    if existing is not None and not is_stale(db, existing.rebalance, user.id):
        return existing  # already priced at today's prices: the same proposal, not a duplicate
    target_items = proposals.item_dicts(target)
    row, plan, drift = _plan_row(ctx, db, source_id=target.id, held=held, cash=cash, items=target_items)
    if not plan["trades"]:
        raise ApiError(409, "STATE_CONFLICT", NOTHING_TO_TRADE)
    replaced = None
    if existing is not None:
        existing.status = "superseded"
        replaced = existing.id
    amount = drift["total_value"]
    by_code = {t["product_code"]: t for t in plan["trades"]}
    items = [
        {
            **{k: item[k] for k in ("product_code", "name", "asset_class", "risk_level", "weight_pct")},
            "amount": round2(float(item["weight_pct"]) / 100 * amount),
            "rationale": f"Back to the {float(item['weight_pct']):g}% you agreed to in proposal #{target.id}: "
            f"{_trade_words(by_code.get(item['product_code']))}.",
        }
        for item in target_items
    ]
    as_of = market_engine.market_date(str(ctx.catalog.market["start_date"]), row.market_month)
    note = (
        f"A rebalancing of proposal #{target.id} at the simulated prices of {as_of}: it sells "
        f"{format_money(plan['sell_total'], cents=True)} and buys {format_money(plan['buy_total'], cents=True)}. "
        "Nothing trades until you pass the quiz and confirm."
    )
    proposal = proposals.persist(
        db,
        ctx,
        user=user,
        profile=profile,
        amount=amount,
        horizon_years=target.horizon_years,
        near_term_need=target.near_term_need,
        items=items,
        notes=[note],
        parent=target,
    )
    row.proposal_id = proposal.id
    proposal.rebalance = row
    db.flush()
    logs.add(
        db,
        user_id=user.id,
        actor=actor,
        action="rebalance_proposed",
        tier="T2",
        decision="allowed",
        detail={
            "proposal_id": proposal.id,
            "source_proposal_id": target.id,
            "market_month": row.market_month,
            "largest_drift": drift["largest"],
            "sell_total": plan["sell_total"],
            "buy_total": plan["buy_total"],
            "replaced": replaced,
        },
    )
    logs.add(
        db,
        user_id=user.id,
        actor="system",
        action="gate_decided",
        detail={
            "proposal_id": proposal.id,
            "decision": proposal.gate.decision,
            "failed_rule_ids": failed_rule_ids({"rules": proposal.gate.rules}),
        },
    )
    db.commit()
    return proposal


def carry_over(db: Session, ctx: AppContext, parent: Proposal, child: Proposal) -> None:
    """A revision of a rebalancing (How to fix, or the what-if lab) stays a rebalancing, with trades for its weights."""
    if parent.rebalance is None:
        return
    held, cash = holdings(db, parent.user_id)
    source = parent.rebalance.source_proposal_id
    row, plan, _drift = _plan_row(ctx, db, source_id=source, held=held, cash=cash, items=proposals.item_dicts(child))
    row.proposal_id = child.id
    child.rebalance = row
    by_code = {t["product_code"]: t for t in plan["trades"]}
    for item in child.items:
        change = proposals.CHANGE_NOTE.search(item.rationale)
        item.rationale = (
            f"Rebalancing of proposal #{source} to {item.weight_pct:g}%: {_trade_words(by_code.get(item.product.code))}."
            + (change.group(0) if change else "")
        )
    db.flush()
