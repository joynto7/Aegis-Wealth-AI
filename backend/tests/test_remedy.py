"""How to fix (addition): the counterfactual repair of a gate decision, computed by code."""

from __future__ import annotations

import random

import pytest

from app.engines.remedy import suggest_fix
from tests.engine_helpers import allocate, item


def fix(catalog, weights, tier=3, amount=200_000, horizon=8, need=30_000, max_loss=20):
    items = [item(catalog, code, w, amount) for code, w in weights.items()]
    return suggest_fix(
        items,
        tier=tier,
        amount=amount,
        horizon_years=horizon,
        near_term_need=need,
        max_acceptable_loss_pct=max_loss,
        products=catalog.products,
        by_code=catalog.by_code,
        history=catalog.history,
        scenarios=catalog.scenarios,
        thresholds=catalog.thresholds,
    )


def weights_of(result):
    return {i["product_code"]: i["weight_pct"] for i in result["items"]}


def test_at07_concentration_is_fixed_within_the_class(catalog):
    result = fix(catalog, {"DEP-01": 9, "SBF-01": 13, "SBF-02": 13, "GLD-01": 5, "IDX-01": 60})
    assert result["gate_before"] == "REJECT" and "R-03" in result["failed_before"]
    assert result["gate_after"] == "PASS" and result["failed_after"] == []
    assert weights_of(result) == {"DEP-01": 9, "SBF-01": 40, "SBF-02": 21, "GLD-01": 5, "IDX-01": 25}
    idx = next(c for c in result["changes"] if c["product_code"] == "IDX-01")
    assert (idx["from_pct"], idx["to_pct"]) == (60, 25) and "R-03" in idx["rule_ids"]


def test_scenario4_everything_in_the_thematic_fund_becomes_a_suitable_mix(catalog):
    result = fix(catalog, {"HGF-01": 100})
    assert result["gate_before"] == "REJECT" and {"R-02", "R-03", "R-04"} <= set(result["failed_before"])
    assert result["gate_after"] == "PASS"
    assert weights_of(result) == {"IDX-01": 25, "DEP-01": 15, "SBF-01": 40, "SBF-02": 20}
    hgf = next(c for c in result["changes"] if c["product_code"] == "HGF-01")
    assert hgf["to_pct"] == 0 and hgf["rule_ids"] == ["R-02"] and "above your tier 3" in hgf["reasons"][0]


def test_a_passing_proposal_needs_no_change(catalog):
    result = fix(catalog, {i["product_code"]: i["weight_pct"] for i in allocate(catalog).items})
    assert (result["gate_before"], result["gate_after"], result["changes"]) == ("PASS", "PASS", [])
    assert result["summary"].startswith("Nothing to change")


@pytest.mark.parametrize(
    ("weights", "kwargs", "rule"),
    [
        ({"DEP-01": 10, "SBF-01": 30, "IDX-01": 40, "GLD-01": 20}, {"horizon": 2, "need": 10_000}, "R-05"),
        ({"DEP-02": 20, "BND-03": 40, "SBF-01": 20, "IDX-01": 20}, {"horizon": 2, "need": 0}, "R-06"),
        ({"DEP-01": 15, "SBF-01": 25, "IDX-01": 25}, {"need": 0}, "R-01"),
        ({"DEP-01": 10, "AEF-01": 30, "AEF-02": 30, "BND-02": 30}, {"tier": 4, "need": 0, "max_loss": 40}, "R-07"),
        ({"IDX-01": 50, "SBF-01": 50}, {"tier": 1, "need": 0, "max_loss": 5}, "R-02"),
    ],
)
def test_each_rule_has_a_repair(catalog, weights, kwargs, rule):
    result = fix(catalog, weights, **kwargs)
    assert rule in result["failed_before"] and rule in result["fixed_rule_ids"]
    assert result["gate_after"] == "PASS"
    assert sum(weights_of(result).values()) == pytest.approx(100)


def test_a_soft_rule_that_cannot_be_met_is_reported_not_hidden(catalog):
    result = fix(catalog, {"DEP-01": 10, "SBF-01": 40, "GLD-01": 50}, tier=2, need=0, max_loss=10)
    assert result["gate_after"] == "WARNING" and result["failed_after"] == ["R-08"]


def test_no_random_revision_is_left_with_a_hard_failure(catalog):
    """A seeded sweep over tiers, horizons, amounts, needs and arbitrary weights (also not totalling 100)."""
    rng = random.Random(7)
    codes = [p.code for p in catalog.products]
    for _ in range(600):
        amount = rng.choice([10_000, 50_000, 200_000, 1_000_000])
        chosen = rng.sample(codes, rng.randint(1, 6))
        raw = [rng.random() for _ in chosen]
        weights = [round(r / sum(raw) * 100) for r in raw]
        weights[-1] += 100 - sum(weights)
        if rng.random() < 0.15:
            weights[0] = max(0, weights[0] + rng.choice([-7, 9]))
        result = fix(
            catalog,
            dict(zip(chosen, weights, strict=True)),
            tier=rng.randint(1, 5),
            amount=amount,
            horizon=rng.choice([1, 2, 3, 5, 8, 15, 30]),
            need=rng.choice([0, amount * 0.1, amount * 0.37, amount]),
            max_loss=rng.choice([5, 10, 20, 30, 40]),
        )
        assert result["gate_after"] != "REJECT", result
        assert sum(weights_of(result).values()) == pytest.approx(100)
