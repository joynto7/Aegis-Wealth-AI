"""Proposals (Sections 2.5.3-2.5.5, 2.5.9): build, gate, revise, acknowledge, quiz.

The gate runs inside this service, so no path that creates or changes a
proposal can skip it (Section 2.8.1, T2).
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.core.timeutil import iso
from app.engines.allocation import build_allocation, class_weights_of
from app.engines.chain import items_hash
from app.engines.gate import evaluate_gate, failed_rule_ids
from app.engines.metrics import compute_metrics
from app.engines.numbers import format_pct, round2
from app.engines.quiz import build_quiz, check_quiz
from app.engines.remedy import suggest_fix
from app.engines.stress import compute_stress
from app.models import GateResult, Product, Profile, Proposal, ProposalItem, QuizAttempt, SandboxAccount, User
from app.services import logs
from app.services.context import AppContext

OPEN_STATUSES = ("rejected", "warning", "acknowledged", "passed")
CONFIRMABLE = ("passed", "acknowledged")
DATA_LABEL = "Sample data; stress results are hypothetical"


def _gate(proposal: Proposal) -> dict[str, Any]:
    return {"decision": proposal.gate.decision, "rules": proposal.gate.rules}


def _status_for(decision: str) -> str:
    return {"REJECT": "rejected", "WARNING": "warning"}.get(decision, "passed")


def item_dicts(proposal: Proposal) -> list[dict[str, Any]]:
    return [
        {
            "product_code": it.product.code,
            "name": it.product.name,
            "asset_class": it.product.asset_class,
            "risk_level": it.product.risk_level,
            "weight_pct": it.weight_pct,
            "amount": it.amount,
            "rationale": it.rationale,
        }
        for it in proposal.items
    ]


def to_schema(proposal: Proposal, ctx: AppContext) -> dict[str, Any]:
    items = item_dicts(proposal)
    gate = proposal.gate
    return {
        "id": proposal.id,
        "version": proposal.version,
        "parent_id": proposal.parent_id,
        "status": proposal.status,
        "tier": proposal.tier,
        "amount": proposal.amount,
        "horizon_years": proposal.horizon_years,
        "near_term_need": proposal.near_term_need,
        "items": items,
        "class_weights_pct": class_weights_of(items),
        "metrics": proposal.metrics,
        "stress": proposal.stress,
        "gate": {"decision": gate.decision, "rules": gate.rules, "acknowledged_rule_ids": list(gate.acknowledged_rule_ids)},
        "quiz_passed": proposal.quiz_passed,
        "notes": list(proposal.notes),
        "data_label": DATA_LABEL,
        "data_as_of": ctx.catalog.products_as_of,
        "created_at": iso(proposal.created_at),
    }


def summary(proposal: Proposal) -> dict[str, Any]:
    return {
        "id": proposal.id,
        "version": proposal.version,
        "status": proposal.status,
        "amount": proposal.amount,
        "tier": proposal.tier,
        "gate_decision": proposal.gate.decision,
        "created_at": iso(proposal.created_at),
    }


def list_for(db: Session, user: User) -> list[Proposal]:
    return list(db.scalars(select(Proposal).where(Proposal.user_id == user.id).order_by(Proposal.id.desc())).all())


def get_owned(db: Session, user: User, proposal_id: int) -> Proposal:
    """404 when it doesn't exist, 403 when it is another client's (AT-02)."""
    proposal = db.get(Proposal, proposal_id)
    if proposal is None:
        raise ApiError(404, "NOT_FOUND", "There is no proposal with this id.")
    if proposal.user_id != user.id:
        raise ApiError(403, "FORBIDDEN", "This proposal belongs to another client.")
    return proposal


def latest_open(db: Session, user: User) -> Proposal | None:
    return db.scalars(
        select(Proposal)
        .where(Proposal.user_id == user.id, Proposal.status.in_(OPEN_STATUSES + ("executed",)))
        .order_by(Proposal.id.desc())
        .limit(1)
    ).first()


def _persist(
    db: Session,
    ctx: AppContext,
    *,
    user: User,
    profile: Profile,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    items: list[dict[str, Any]],
    notes: list[str],
    parent: Proposal | None,
) -> Proposal:
    catalog = ctx.catalog
    weights = class_weights_of(items)
    metrics = compute_metrics(items, weights, catalog.history, catalog.by_code)
    stress = compute_stress(weights, amount, catalog.scenarios)
    gate = evaluate_gate(
        items=items,
        class_weights_pct=weights,
        metrics=metrics,
        stress=stress,
        tier=profile.tier,
        amount=amount,
        horizon_years=horizon_years,
        near_term_need=near_term_need,
        max_acceptable_loss_pct=profile.max_acceptable_loss_pct,
        by_code=catalog.by_code,
        thresholds=catalog.thresholds,
    )
    products = {p.code: p for p in db.scalars(select(Product).where(Product.code.in_([i["product_code"] for i in items])))}
    proposal = Proposal(
        user_id=user.id,
        profile_id=profile.id,
        parent_id=parent.id if parent else None,
        version=(parent.version + 1) if parent else 1,
        status=_status_for(gate["decision"]),
        tier=profile.tier,
        amount=round2(amount),
        horizon_years=horizon_years,
        near_term_need=round2(near_term_need),
        items_hash=items_hash((i["product_code"], i["weight_pct"]) for i in items),
        metrics=metrics,
        stress=stress,
        quiz_passed=False,
        notes=notes,
    )
    proposal.items = [
        ProposalItem(
            product_id=products[i["product_code"]].id,
            position=pos,
            weight_pct=float(i["weight_pct"]),
            amount=i["amount"],
            rationale=i["rationale"],
        )
        for pos, i in enumerate(items)
    ]
    proposal.gate = GateResult(decision=gate["decision"], rules=gate["rules"], acknowledged_rule_ids=[])
    db.add(proposal)
    db.flush()
    return proposal


def _check_cash(db: Session, user: User, amount: float) -> None:
    account = db.scalars(select(SandboxAccount).where(SandboxAccount.user_id == user.id)).first()
    cash = account.cash if account else 0.0
    if amount > cash:
        raise ApiError(
            409, "INSUFFICIENT_CASH", f"Your sandbox account holds CNY {cash:,.2f}, less than this amount.", {"cash": cash}
        )


def create(
    db: Session,
    ctx: AppContext,
    user: User,
    profile: Profile,
    *,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    actor: str = "client",
) -> Proposal:
    if near_term_need > amount:
        raise validation_error(
            "Near-term need must be between CNY 0 and the amount.",
            [{"field": "near_term_need", "problem": "must not exceed amount"}],
        )
    _check_cash(db, user, amount)
    alloc = build_allocation(
        profile.tier,
        amount,
        horizon_years,
        near_term_need,
        model_portfolios=ctx.catalog.model_portfolios,
        products=ctx.catalog.products,
    )
    proposal = _persist(
        db,
        ctx,
        user=user,
        profile=profile,
        amount=amount,
        horizon_years=horizon_years,
        near_term_need=near_term_need,
        items=alloc.items,
        notes=alloc.notes,
        parent=None,
    )
    logs.add(db, user_id=user.id, actor=actor, action="proposal_created", decision="allowed", detail={"proposal_id": proposal.id})
    logs.add(
        db,
        user_id=user.id,
        actor="system",
        action="gate_decided",
        detail={
            "proposal_id": proposal.id,
            "decision": proposal.gate.decision,
            "failed_rule_ids": failed_rule_ids(_gate(proposal)),
        },
    )
    db.commit()
    return proposal


CHANGE_NOTE = re.compile(r"\s*Weight changed by (?:you|the advisor agent) from [\d.]+% to [\d.]+%\.")


def _revised_items(parent: Proposal, raw: list[dict[str, Any]], ctx: AppContext, actor: str) -> list[dict[str, Any]]:
    by_parent = {i["product_code"]: i for i in item_dicts(parent)}
    who = "the advisor agent" if actor == "agent" else "you"
    items = []
    for entry in raw:
        code, weight = entry["product_code"], float(entry["weight_pct"])
        product = ctx.catalog.product(code)
        if product is None:
            raise validation_error(f"Unknown product code: {code}.", [{"field": "items", "problem": f"unknown product {code}"}])
        before = by_parent.get(code)
        if before and float(before["weight_pct"]) == weight:
            why = before["rationale"]
        elif before:
            base = CHANGE_NOTE.sub("", before["rationale"])  # keep only the latest change, not the whole history
            why = f"{base} Weight changed by {who} from {format_pct(before['weight_pct'])} to {format_pct(weight)}."
        else:
            why = (
                f"Added by {who} in revise mode: {product.annual_fee_pct:.2f}% a year, "
                f"risk level R{product.risk_level}, {product.liquidity_days}-day access."
            )
        items.append(
            {
                "product_code": product.code,
                "name": product.name,
                "asset_class": product.asset_class,
                "risk_level": product.risk_level,
                "weight_pct": weight,
                "amount": round2(weight / 100 * parent.amount),
                "rationale": why,
            }
        )
    return items


def revise(
    db: Session,
    ctx: AppContext,
    user: User,
    parent: Proposal,
    profile: Profile,
    raw_items: list[dict[str, Any]],
    *,
    actor: str = "client",
) -> Proposal:
    if parent.status not in OPEN_STATUSES:
        raise ApiError(409, "STATE_CONFLICT", f"This proposal is {parent.status} and can no longer be revised.")
    total = sum(float(i["weight_pct"]) for i in raw_items)
    if abs(total - 100) > float(ctx.catalog.thresholds["allocation_total_tolerance_pct"]):
        raise validation_error("Weights must add up to 100%.", [{"field": "items", "problem": f"weights total {total:g}"}])
    items = _revised_items(parent, raw_items, ctx, actor)
    proposal = _persist(
        db,
        ctx,
        user=user,
        profile=profile,
        amount=parent.amount,
        horizon_years=parent.horizon_years,
        near_term_need=parent.near_term_need,
        items=items,
        notes=[],
        parent=parent,
    )
    parent.status = "superseded"
    logs.add(
        db,
        user_id=user.id,
        actor=actor,
        action="proposal_revised",
        decision="allowed",
        detail={"proposal_id": proposal.id, "parent_id": parent.id},
    )
    logs.add(
        db,
        user_id=user.id,
        actor="system",
        action="gate_decided",
        detail={
            "proposal_id": proposal.id,
            "decision": proposal.gate.decision,
            "failed_rule_ids": failed_rule_ids(_gate(proposal)),
        },
    )
    db.commit()
    return proposal


def preview(ctx: AppContext, parent: Proposal, profile: Profile, raw_items: list[dict[str, Any]]) -> dict[str, Any]:
    """A dry run of a revision (addition): the same items, engines and gate as revise(), and nothing is saved.

    The total is not forced to 100 here, so the what-if lab can show R-01 failing while weights are moved.
    """
    catalog = ctx.catalog
    items = _revised_items(parent, raw_items, ctx, "client")
    weights = class_weights_of(items)
    metrics = compute_metrics(items, weights, catalog.history, catalog.by_code)
    stress = compute_stress(weights, parent.amount, catalog.scenarios)
    gate = evaluate_gate(
        items=items,
        class_weights_pct=weights,
        metrics=metrics,
        stress=stress,
        tier=profile.tier,
        amount=parent.amount,
        horizon_years=parent.horizon_years,
        near_term_need=parent.near_term_need,
        max_acceptable_loss_pct=profile.max_acceptable_loss_pct,
        by_code=catalog.by_code,
        thresholds=catalog.thresholds,
    )
    return {
        "proposal_id": parent.id,
        "total_pct": round2(sum(float(i["weight_pct"]) for i in items)),
        "items": items,
        "class_weights_pct": weights,
        "metrics": metrics,
        "stress": stress,
        "gate": gate,
        "data_label": DATA_LABEL,
    }


def remedy(ctx: AppContext, proposal: Proposal, profile: Profile) -> dict[str, Any]:
    """How to fix (addition): the smallest change that passes the gate, for the client to apply as a revision."""
    catalog = ctx.catalog
    result = suggest_fix(
        item_dicts(proposal),
        tier=profile.tier,
        amount=proposal.amount,
        horizon_years=proposal.horizon_years,
        near_term_need=proposal.near_term_need,
        max_acceptable_loss_pct=profile.max_acceptable_loss_pct,
        products=catalog.products,
        by_code=catalog.by_code,
        history=catalog.history,
        scenarios=catalog.scenarios,
        thresholds=catalog.thresholds,
    )
    return {"proposal_id": proposal.id, "version": proposal.version, **result, "data_label": DATA_LABEL}


def ensure_open(proposal: Proposal) -> None:
    if proposal.status == "rejected":
        raise ApiError(
            409,
            "GATE_REJECTED",
            "This proposal was rejected by the compliance gate.",
            {"rule_ids": failed_rule_ids(_gate(proposal), "hard")},
        )
    if proposal.status not in OPEN_STATUSES:
        raise ApiError(409, "STATE_CONFLICT", f"This proposal is {proposal.status} and can no longer change.")


def acknowledge(db: Session, ctx: AppContext, user: User, proposal: Proposal, rule_ids: list[str]) -> Proposal:
    ensure_open(proposal)
    soft_fails = set(failed_rule_ids(_gate(proposal), "soft"))
    unknown = [r for r in rule_ids if r not in soft_fails]
    if unknown:
        raise validation_error(
            "Only this proposal's warnings can be acknowledged.",
            [{"field": "rule_ids", "problem": f"{r} is not a warning on this proposal"} for r in unknown],
        )
    acknowledged = sorted(set(proposal.gate.acknowledged_rule_ids) | set(rule_ids))
    proposal.gate.acknowledged_rule_ids = acknowledged
    if proposal.status == "warning" and soft_fails <= set(acknowledged):
        proposal.status = "acknowledged"
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="warnings_acknowledged",
        decision="allowed",
        detail={"proposal_id": proposal.id, "rule_ids": rule_ids, "status": proposal.status},
    )
    db.commit()
    return proposal


def quiz(proposal: Proposal, ctx: AppContext) -> list[dict[str, Any]]:
    ensure_open(proposal)
    return build_quiz(to_schema(proposal, ctx))


def submit_quiz(db: Session, ctx: AppContext, user: User, proposal: Proposal, answers: dict[str, str]) -> dict[str, Any]:
    ensure_open(proposal)
    result = check_quiz(to_schema(proposal, ctx), answers)
    db.add(QuizAttempt(proposal_id=proposal.id, answers=dict(answers), passed=result["passed"], results=result["results"]))
    # The latest attempt decides, so the advice record's quiz always matches quiz_passed.
    proposal.quiz_passed = result["passed"]
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="quiz_attempted",
        decision="allowed" if result["passed"] else "denied",
        detail={"proposal_id": proposal.id, "passed": result["passed"]},
    )
    db.commit()
    return result
