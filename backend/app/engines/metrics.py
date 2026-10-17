"""Risk metrics (Section 2.5.4), computed on the asset-class history so they agree with the replay.

r_p,t = sum_c w_c r_c,t;  sigma_annual = stdev(r_p) * sqrt(12) (sample, n - 1);
MDD = max_t (P_t - V_t) / P_t with V_t = prod_{s<=t} (1 + r_p,s), P_t = max_{s<=t} V_s.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from app.engines.catalog import ASSET_CLASSES, MonthlyReturn, ProductSpec
from app.engines.numbers import round1, round2


def portfolio_returns(class_weights_pct: Mapping[str, float], history: tuple[MonthlyReturn, ...]) -> list[float]:
    return [sum(class_weights_pct.get(c, 0.0) / 100 * row.of(c) for c in ASSET_CLASSES) for row in history]


def annual_volatility(returns: list[float]) -> float:
    n = len(returns)
    if n < 2:
        return 0.0
    mean = sum(returns) / n
    variance = sum((r - mean) ** 2 for r in returns) / (n - 1)
    return math.sqrt(variance) * math.sqrt(12)


def max_drawdown(returns: list[float]) -> float:
    value, peak, worst = 1.0, 0.0, 0.0
    for r in returns:
        value *= 1 + r
        peak = max(peak, value)
        worst = max(worst, (peak - value) / peak)
    return worst


def compute_metrics(
    items: list[dict[str, Any]],
    class_weights_pct: Mapping[str, float],
    history: tuple[MonthlyReturn, ...],
    by_code: Mapping[str, ProductSpec],
) -> dict[str, float]:
    returns = portfolio_returns(class_weights_pct, history)
    weighted_fee = liquid = largest = 0.0
    for item in items:
        product = by_code[item["product_code"]]
        w = float(item["weight_pct"])
        weighted_fee += w / 100 * product.annual_fee_pct
        if product.liquid:
            liquid += w
        if product.asset_class != "cash":
            largest = max(largest, w)
    return {
        "volatility_pct": round1(annual_volatility(returns) * 100),
        "max_drawdown_pct": round1(max_drawdown(returns) * 100),
        "weighted_fee_pct": round2(weighted_fee),
        "liquid_share_pct": round1(liquid),
        "largest_weight_pct": round1(largest),
    }
