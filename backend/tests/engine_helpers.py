"""Builders shared by the engine tests."""

from __future__ import annotations

from app.engines.allocation import build_allocation, class_weights_of
from app.engines.gate import evaluate_gate
from app.engines.metrics import compute_metrics
from app.engines.numbers import round2
from app.engines.stress import compute_stress


def allocate(catalog, tier=3, amount=200_000, horizon=8, need=30_000):
    return build_allocation(tier, amount, horizon, need, model_portfolios=catalog.model_portfolios, products=catalog.products)


def gate_for(catalog, items, tier=3, amount=200_000, horizon=8, need=30_000, max_loss=20):
    weights = class_weights_of(items)
    metrics = compute_metrics(items, weights, catalog.history, catalog.by_code)
    stress = compute_stress(weights, amount, catalog.scenarios)
    return evaluate_gate(
        items=items,
        class_weights_pct=weights,
        metrics=metrics,
        stress=stress,
        tier=tier,
        amount=amount,
        horizon_years=horizon,
        near_term_need=need,
        max_acceptable_loss_pct=max_loss,
        by_code=catalog.by_code,
        thresholds=catalog.thresholds,
    )


def item(catalog, code, weight, amount=200_000):
    p = catalog.product(code)
    return {
        "product_code": code,
        "name": p.name,
        "asset_class": p.asset_class,
        "risk_level": p.risk_level,
        "weight_pct": weight,
        "amount": round2(weight / 100 * amount),
        "rationale": "",
    }


def failed(gate):
    return [r["id"] for r in gate["rules"] if r["result"] == "fail"]
