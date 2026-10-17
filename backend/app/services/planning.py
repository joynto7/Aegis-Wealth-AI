"""Planning (addition): goal projections, the saved goal, the dashboard briefing and live-portfolio analytics.

Everything here is computed by code from the engines; nothing is written by
the language model. Projections are illustrative (resampled from the synthetic
history) and say so, and a tier above the client's own is shown as locked.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.core.timeutil import iso, utcnow
from app.engines.allocation import build_allocation
from app.engines.catalog import ASSET_CLASSES
from app.engines.metrics import compute_metrics
from app.engines.numbers import format_money, round1, round2
from app.engines.projection import DATA_LABEL as PROJECTION_LABEL
from app.engines.projection import METHOD, project
from app.engines.stress import compute_stress, worst_scenario
from app.models import Goal, Proposal, User
from app.services import logs, profiles, proposals, sandbox
from app.services.context import AppContext

# The allocation engine picks products by minimum investment; below this the mix of a tier is judged at this size.
MIX_REFERENCE_AMOUNT = 100_000
DEFAULT_AMOUNT = 100_000
DEFAULT_HORIZON = 10
INSIGHT_SOURCE = "Computed by code from your own data; not written by the AI."
REACTIONS = {"hold": "Hold", "buy_more": "Buy more", "sell_some": "Sell some", "sell_all": "Sell everything"}


# --- mixes --------------------------------------------------------------------------
def tier_mix(ctx: AppContext, tier: int, amount: float, horizon_years: int) -> tuple[dict[str, float], float]:
    """The class weights and weighted fee of the mix the allocation engine builds for a tier (no near-term need)."""
    catalog = ctx.catalog
    alloc = build_allocation(
        tier,
        max(amount, MIX_REFERENCE_AMOUNT),
        horizon_years,
        0,
        model_portfolios=catalog.model_portfolios,
        products=catalog.products,
    )
    metrics = compute_metrics(alloc.items, alloc.class_weights_pct, catalog.history, catalog.by_code)
    return dict(alloc.class_weights_pct), float(metrics["weighted_fee_pct"])


def account_mix(db: Session, ctx: AppContext, user: User) -> tuple[dict[str, float], float, dict[str, Any]]:
    """Class weights and weighted fee of the live sandbox portfolio, cash included."""
    acct = sandbox.account(db, user)
    total = float(acct["total_value"])
    values = {c: 0.0 for c in ASSET_CLASSES}
    values["cash"] += float(acct["cash"])
    fee = 0.0
    for pos in acct["positions"]:
        values[pos["asset_class"]] += float(pos["value"])
        product = ctx.catalog.product(pos["product_code"])
        if product is not None:
            fee += float(pos["value"]) * product.annual_fee_pct
    if total <= 0:
        return {"cash": 100.0, "bond": 0.0, "gold": 0.0, "equity": 0.0}, 0.0, acct
    weights = {c: round2(values[c] / total * 100) for c in ASSET_CLASSES}
    return weights, round2(fee / total), acct


def _proposal_mix(proposal: Proposal, ctx: AppContext) -> tuple[dict[str, float], float]:
    doc = proposals.to_schema(proposal, ctx)
    return dict(doc["class_weights_pct"]), float(doc["metrics"]["weighted_fee_pct"])


# --- projections ----------------------------------------------------------------------
def projection(db: Session, ctx: AppContext, user: User, body: dict[str, Any]) -> dict[str, Any]:
    profile = profiles.latest(db, user.id)
    client_tier = profile.tier if profile is not None else None
    kind = body.get("basis", "tier")
    monthly = float(body.get("monthly_contribution") or 0)
    target = body.get("target_amount")
    proposal_id = None
    tier = None

    if kind == "proposal":
        if body.get("proposal_id") is None:
            raise validation_error("Choose a proposal.", [{"field": "proposal_id", "problem": "required for basis proposal"}])
        proposal = proposals.get_owned(db, user, int(body["proposal_id"]))
        weights, fee = _proposal_mix(proposal, ctx)
        amount = float(body["amount"]) if body.get("amount") is not None else proposal.amount
        horizon = int(body.get("horizon_years") or proposal.horizon_years)
        proposal_id, tier = proposal.id, proposal.tier
        label = f"Proposal #{proposal.id} (version {proposal.version})"
    elif kind == "account":
        weights, fee, acct = account_mix(db, ctx, user)
        amount = float(body["amount"]) if body.get("amount") is not None else float(acct["total_value"])
        horizon = int(body.get("horizon_years") or DEFAULT_HORIZON)
        label = "Your sandbox portfolio"
    else:
        tier = int(body.get("tier") or client_tier or 0)
        if tier < 1:
            raise ApiError(409, "PROFILE_REQUIRED", "Complete your risk profile first, or choose a tier.")
        amount = float(body["amount"]) if body.get("amount") is not None else DEFAULT_AMOUNT
        horizon = int(body.get("horizon_years") or DEFAULT_HORIZON)
        weights, fee = tier_mix(ctx, tier, amount, horizon)
        label = f"Tier {tier} ({ctx.catalog.tier_label(tier)}) mix"

    if amount + monthly <= 0:
        raise validation_error(
            "Enter a starting amount or a monthly contribution.",
            [{"field": "amount", "problem": "amount and monthly_contribution are both 0"}],
        )
    if amount > 10_000_000:
        raise validation_error("The amount must be at most CNY 10,000,000.", [{"field": "amount", "problem": "too large"}])

    history = ctx.catalog.history
    result = project(
        weights,
        fee,
        amount=amount,
        horizon_years=horizon,
        monthly_contribution=monthly,
        target_amount=float(target) if target is not None else None,
        history=history,
    )

    tiers = []
    if body.get("compare_tiers", True):
        for t in sorted(ctx.catalog.tier_labels):
            t_weights, t_fee = tier_mix(ctx, t, amount, horizon)
            t_result = project(
                t_weights,
                t_fee,
                amount=amount,
                horizon_years=horizon,
                monthly_contribution=monthly,
                target_amount=float(target) if target is not None else None,
                history=history,
            )
            tiers.append(
                {
                    "tier": t,
                    "label": ctx.catalog.tier_label(t),
                    "suitable": client_tier is not None and t <= client_tier,
                    "class_weights_pct": t_weights,
                    "weighted_fee_pct": t_fee,
                    "probability_target_pct": t_result["probability_target_pct"],
                    "p10_end": t_result["end"]["p10"],
                    "p50_end": t_result["end"]["p50"],
                    "p90_end": t_result["end"]["p90"],
                }
            )

    return {
        "basis": {"kind": kind, "label": label, "proposal_id": proposal_id, "tier": tier},
        "amount": round2(amount),
        "horizon_years": horizon,
        "monthly_contribution": round2(monthly),
        "target_amount": round2(float(target)) if target is not None else None,
        "class_weights_pct": weights,
        "weighted_fee_pct": fee,
        "method": METHOD,
        **result,
        "tiers": tiers,
        "client_tier": client_tier,
        "data_label": PROJECTION_LABEL,
        "history_label": f"{ctx.catalog.history_label} monthly history, as of {ctx.catalog.history_as_of}",
    }


# --- goals --------------------------------------------------------------------------------
def goal_schema(goal: Goal | None) -> dict[str, Any] | None:
    if goal is None:
        return None
    return {
        "id": goal.id,
        "name": goal.name,
        "target_amount": goal.target_amount,
        "horizon_years": goal.horizon_years,
        "monthly_contribution": goal.monthly_contribution,
        "created_at": iso(goal.created_at),
    }


def current_goal(db: Session, user: User) -> Goal | None:
    return db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.id.desc()).limit(1)).first()


def set_goal(db: Session, user: User, body: dict[str, Any]) -> Goal:
    goal = Goal(
        user_id=user.id,
        name=body["name"],
        target_amount=round2(float(body["target_amount"])),
        horizon_years=int(body["horizon_years"]),
        monthly_contribution=round2(float(body.get("monthly_contribution") or 0)),
    )
    db.add(goal)
    db.flush()
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="goal_set",
        decision="allowed",
        detail={"goal_id": goal.id, "target_amount": goal.target_amount, "horizon_years": goal.horizon_years},
    )
    db.commit()
    return goal


# --- live-portfolio analytics --------------------------------------------------------------
def analytics(db: Session, ctx: AppContext, user: User) -> dict[str, Any]:
    weights, fee, acct = account_mix(db, ctx, user)
    total = float(acct["total_value"])
    largest = max((float(p["value"]) for p in acct["positions"]), default=0.0)
    return {
        "total_value": round2(total),
        "cash": round2(float(acct["cash"])),
        "invested": round2(total - float(acct["cash"])),
        "class_weights_pct": weights,
        "weighted_fee_pct": fee,
        "largest_position_pct": round1(largest / total * 100) if total > 0 else 0.0,
        "positions": len(acct["positions"]),
        "stress": compute_stress(weights, total, ctx.catalog.scenarios),
        "data_label": "Simulated; stress results are hypothetical",
    }


# --- the briefing ---------------------------------------------------------------------------
def _insight(
    id_: str,
    tone: str,
    title: str,
    body: str,
    figure: str | None = None,
    figure_label: str | None = None,
    href: str | None = None,
    action: str | None = None,
) -> dict[str, Any]:
    return {
        "id": id_,
        "tone": tone,
        "title": title,
        "body": body,
        "figure": figure,
        "figure_label": figure_label,
        "href": href,
        "action": action,
    }


def _rule_name(ctx: AppContext, rule_id: str) -> str:
    rule = ctx.catalog.rule(rule_id)
    return str(rule["name"]) if rule else rule_id


def insights(db: Session, ctx: AppContext, user: User) -> dict[str, Any]:
    catalog = ctx.catalog
    profile = profiles.latest(db, user.id)
    proposal = proposals.latest_open(db, user)
    acct = sandbox.account(db, user)
    goal = current_goal(db, user)
    items: list[dict[str, Any]] = []
    doc = proposals.to_schema(proposal, ctx) if proposal is not None else None

    # The saved goal against the latest proposal (or the live portfolio once it is invested).
    if goal is not None and (doc is not None or acct["positions"]):
        basis = (
            {"basis": "proposal", "proposal_id": doc["id"]}
            if doc is not None and doc["status"] != "executed"
            else {"basis": "account"}
        )
        result = projection(
            db,
            ctx,
            user,
            {
                **basis,
                "horizon_years": goal.horizon_years,
                "monthly_contribution": goal.monthly_contribution,
                "target_amount": goal.target_amount,
                "compare_tiers": False,
            },
        )
        p = float(result["probability_target_pct"] or 0)
        tone = "positive" if p >= 75 else "info" if p >= 50 else "attention"
        monthly = f" and {format_money(goal.monthly_contribution)} a month" if goal.monthly_contribution else ""
        items.append(
            _insight(
                "goal",
                tone,
                f"Goal: {goal.name}",
                f"A {p:g}% chance of reaching {format_money(goal.target_amount)} in {goal.horizon_years} years with "
                f"{result['basis']['label'].lower()}{monthly}, in 1,000 illustrative paths.",
                f"{p:g}%",
                "chance of reaching it",
                "/planner",
                "Open the planner",
            )
        )

    if doc is not None:
        amount, horizon, metrics = float(doc["amount"]), int(doc["horizon_years"]), doc["metrics"]
        weights = doc["class_weights_pct"]
        g = sum(weights[c] / 100 * catalog.gross_return[c] for c in ASSET_CLASSES)
        f = float(metrics["weighted_fee_pct"]) / 100
        cost = round2(amount * (1 + g) ** horizon - amount * (1 + g - f) ** horizon)
        href = f"/proposals/{doc['id']}"
        items.append(
            _insight(
                "fees",
                "positive" if metrics["weighted_fee_pct"] <= 0.5 else "info",
                f"Fees over {horizon} years",
                f"At {metrics['weighted_fee_pct']:.2f}% a year, fees take about {format_money(cost)} from proposal "
                f"#{doc['id']} over {horizon} years, at the illustrative returns.",
                format_money(cost),
                "total fees",
                href,
                "See the proposal",
            )
        )

        need = float(doc["near_term_need"])
        if need > 0:
            available = round2(float(metrics["liquid_share_pct"]) / 100 * amount)
            cover = available / need
            items.append(
                _insight(
                    "liquidity",
                    "positive" if cover >= 1 else "attention",
                    "Cash for your near-term need",
                    f"{format_money(available)} can be withdrawn within a day: {cover:.1f} times the "
                    f"{format_money(need)} you need within 2 years.",
                    f"{cover:.1f}×",
                    "need covered",
                    href,
                    "See the proposal",
                )
            )

        if profile is not None:
            worst = worst_scenario(doc["stress"])
            loss = abs(float(worst["loss_pct"]))
            limit = float(profile.max_acceptable_loss_pct)
            within = loss <= limit
            items.append(
                _insight(
                    "stress",
                    "positive" if within else "attention",
                    f"In a {worst['name'].lower()}",
                    f"This hypothetical scenario would cost {format_money(abs(float(worst['loss_cny'])))} "
                    f"({loss:.2f}%), {'within' if within else 'beyond'} the {limit:g}% fall you said you could accept.",
                    f"−{loss:.2f}%",
                    "worst hypothetical loss",
                    href,
                    "See the stress test",
                )
            )

            thresholds = catalog.thresholds
            max_fee = float(thresholds["max_weighted_fee_pct"])
            used = [
                (
                    "R-03",
                    float(metrics["largest_weight_pct"]) / float(thresholds["max_single_product_pct"]),
                    f"{metrics['largest_weight_pct']:g}% in one product against a limit of "
                    f"{float(thresholds['max_single_product_pct']):g}%",
                ),
                (
                    "R-07",
                    float(metrics["weighted_fee_pct"]) / max_fee,
                    f"a {metrics['weighted_fee_pct']:.2f}% fee against a limit of {max_fee:.2f}%",
                ),
                (
                    "R-08",
                    float(metrics["max_drawdown_pct"]) / limit if limit else 0.0,
                    f"a {metrics['max_drawdown_pct']:g}% historical fall against your {limit:g}%",
                ),
                ("R-09", loss / limit if limit else 0.0, f"a {loss:.2f}% stress loss against your {limit:g}%"),
            ]
            rule_id, ratio, words = max(used, key=lambda u: u[1])
            over = ratio > 1
            titles = ("Over a rule's limit", "Closest rule to its limit", "Every rule has room")
            title = titles[0] if over else titles[1] if ratio >= 0.8 else titles[2]
            items.append(
                _insight(
                    "margin",
                    "attention" if ratio >= 0.8 else "positive",
                    title,
                    f"{_rule_name(ctx, rule_id)} ({rule_id}) is {'over its limit' if over else 'the closest'}: {words}.",
                    f"{round1(ratio * 100):g}%",
                    f"of the {rule_id} limit used",
                    href,
                    "See the gate",
                )
            )

    if profile is not None and profile.reactions:
        last = profile.reactions[-1]
        episode = catalog.episode(last.episode_id)
        lowered = profile.replay_adjustment > 0
        items.append(
            _insight(
                "replay",
                "info",
                "What the crisis replay taught",
                f"In {episode.name if episode else last.episode_id} you chose '{REACTIONS.get(last.reaction, last.reaction)}'. "
                + (
                    "Selling at the bottom lowered your tier by one, so your mix takes less risk."
                    if lowered
                    else "Your tier stayed where the questionnaire set it."
                ),
                None,
                None,
                "/profile/replay",
                "Replay another crisis",
            )
        )

    total = float(acct["total_value"])
    executed = doc is not None and doc["status"] == "executed"
    if total > 0 and float(acct["cash"]) / total >= 0.5 and not executed:
        items.append(
            _insight(
                "cash",
                "info",
                "Cash not yet invested",
                f"{format_money(float(acct['cash']))} of your sandbox is cash. A proposal shows how the engine would invest it "
                "for your tier; nothing is bought until you confirm.",
                format_money(float(acct["cash"])),
                "uninvested cash",
                "/proposals/new",
                "Build a proposal",
            )
        )

    return {"items": items, "source": INSIGHT_SOURCE, "generated_at": iso(utcnow())}
