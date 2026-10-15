"""Allocation engine (Section 2.5.3; AT-06)."""

from __future__ import annotations

import pytest

from app.engines.allocation import class_weights_of
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_at06_proposal_example_item_by_item(catalog):
    a = allocate(catalog)
    assert [(i["product_code"], i["weight_pct"], i["amount"]) for i in a.items] == [
        ("DEP-01", 15, 30_000),
        ("SBF-01", 25, 50_000),
        ("SBF-02", 25, 50_000),
        ("GLD-01", 10, 20_000),
        ("IDX-01", 25, 50_000),
    ]
    assert a.class_weights_pct == {"cash": 15, "bond": 50, "gold": 10, "equity": 25}
    assert all(i["rationale"] for i in a.items)


@pytest.mark.parametrize("tier", [1, 2, 3, 4, 5])
@pytest.mark.parametrize("horizon", [2, 5, 10])
@pytest.mark.parametrize("need_pct", [0, 15])
def test_at06_invariants(catalog, tier, horizon, need_pct):
    amount = 200_000
    a = allocate(catalog, tier, amount, horizon, amount * need_pct / 100)
    w = class_weights_of(a.items)
    assert sum(i["weight_pct"] for i in a.items) == 100
    assert w == a.class_weights_pct
    if horizon < 3:
        assert w["equity"] + w["gold"] <= 20
    assert w["cash"] >= need_pct
    assert all(i["risk_level"] <= tier for i in a.items)
    assert all(catalog.product(i["product_code"]).lockup_months <= horizon * 12 for i in a.items)
    assert all(i["weight_pct"] <= 40 for i in a.items if i["asset_class"] != "cash")


def test_liquidity_floor_uses_exact_arithmetic(catalog):
    # 7,000 / 100,000 x 100 is 7.000000000000001 in floating point; the floor must be 7, not 8.
    a = allocate(catalog, tier=5, amount=100_000, horizon=10, need=7_000)
    assert a.class_weights_pct["cash"] == 7


def test_empty_class_moves_its_weight_into_the_cash_item(catalog):
    a = allocate(catalog, tier=3, amount=10_000, horizon=8, need=9_000)
    assert sum(i["weight_pct"] for i in a.items) == 100
    assert sum(i["amount"] for i in a.items) == 10_000
    assert any("moved to cash" in n for n in a.notes)


def test_tier1_is_cash_only(catalog):
    a = allocate(catalog, tier=1, amount=50_000, horizon=5, need=0)
    assert {i["asset_class"] for i in a.items} == {"cash"}
