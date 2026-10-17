"""Risk metrics (Section 2.5.4; AT-08)."""

from __future__ import annotations

import math

import pytest

from app.engines.allocation import class_weights_of
from app.engines.metrics import annual_volatility, compute_metrics, max_drawdown
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_metrics_for_the_example(catalog):
    a = allocate(catalog)
    m = compute_metrics(a.items, class_weights_of(a.items), catalog.history, catalog.by_code)
    assert m["weighted_fee_pct"] == 0.25
    assert m["liquid_share_pct"] == 40.0
    assert m["largest_weight_pct"] == 25.0


def test_metric_formulas_against_hand_calculation():
    returns = [0.1, -0.2, 0.05]
    mean = sum(returns) / 3
    expected = math.sqrt(sum((r - mean) ** 2 for r in returns) / 2) * math.sqrt(12)
    assert annual_volatility(returns) == pytest.approx(expected)
    # V: 1.1, 0.88, 0.924 -> worst drawdown (1.1 - 0.88) / 1.1 = 0.2
    assert max_drawdown(returns) == pytest.approx(0.2)
