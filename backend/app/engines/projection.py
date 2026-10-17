"""Goal projection (addition): a seeded Monte Carlo answer to "will this reach my goal?".

Method: block bootstrap over the monthly history file. Each simulated year is
12 consecutive months drawn from a random start, so crisis months stay together
(drawing single months would scatter them and understate the falls). The
portfolio's monthly return is sum_c w_c r_c,t minus a twelfth of the weighted
annual fee. A monthly contribution is paid in at the end of each month.

Each block is precomputed once. Over months t..t+11:
  G = prod(1 + r)                     growth of money held through the block
  S = sum_k prod_{j>k} (1 + r_j)      value at the block's end of 1 paid in each month
so one simulated year is V' = V x G + m x S, and 1,000 paths of 30 years cost
30,000 multiply-adds.

Path p draws its blocks from mulberry32 seeded with SEED + p. The same question
always gets the same answer; a longer horizon extends each path instead of
reshuffling it; and alternatives (another tier, another contribution) are
compared on the same draws. The mock API ports the generator and gets the same
numbers (frontend/src/mocks/engines/projection.ts).

Each path's end value is linear in the contribution, V_H = A + m x B, so the
contribution needed for a chosen chance of reaching a target is exact: the
nearest-rank quantile of max(0, (target - A) / B) across the paths.

Illustrative only: resampled from the synthetic history file, not a forecast.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from app.engines.catalog import ASSET_CLASSES, MonthlyReturn
from app.engines.numbers import round1, round2

SEED = 20_261_016
PATHS = 1000
BLOCK_MONTHS = 12
PERCENTILES = (10, 25, 50, 75, 90)
CONFIDENCE_LEVELS = (50, 75, 90)
DATA_LABEL = "Illustrative: resampled from synthetic history, not a forecast"
METHOD = (
    "1,000 paths, each year a run of 12 consecutive months drawn at random from the monthly history, "
    "net of the weighted annual fee; contributions paid in at the end of each month."
)
_MASK = 0xFFFFFFFF


class Mulberry32:
    """A small 32-bit generator with an exact JavaScript twin, so the mock API gives the same paths."""

    def __init__(self, seed: int):
        self.state = seed & _MASK

    def next(self) -> float:
        self.state = (self.state + 0x6D2B79F5) & _MASK
        a = self.state
        t = ((a ^ (a >> 15)) * (a | 1)) & _MASK
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & _MASK)) & _MASK) ^ t
        return ((t ^ (t >> 14)) & _MASK) / 4294967296


def monthly_returns(
    class_weights_pct: Mapping[str, float], weighted_fee_pct: float, history: Sequence[MonthlyReturn]
) -> list[float]:
    drag = weighted_fee_pct / 100 / 12
    out = []
    for row in history:
        r = 0.0
        for c in ASSET_CLASSES:
            r += class_weights_pct.get(c, 0.0) / 100 * row.of(c)
        out.append(r - drag)
    return out


def blocks(returns: Sequence[float]) -> tuple[list[float], list[float]]:
    """Growth G and annuity S of every 12-month block in the history."""
    growth, annuity = [], []
    for start in range(len(returns) - BLOCK_MONTHS + 1):
        g, s = 1.0, 0.0
        for r in returns[start : start + BLOCK_MONTHS]:
            g *= 1 + r
            s = s * (1 + r) + 1
        growth.append(g)
        annuity.append(s)
    return growth, annuity


def percentile(sorted_values: Sequence[float], q: float) -> float:
    """Linear interpolation between the closest ranks (the usual 'linear' method)."""
    n = len(sorted_values)
    if n == 0:
        return 0.0
    pos = (n - 1) * q / 100
    lo = math.floor(pos)
    hi = min(lo + 1, n - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def _nearest_rank(sorted_values: Sequence[float], q: float) -> float:
    """The smallest value with at least q% of the values at or below it."""
    rank = max(1, math.ceil(q / 100 * len(sorted_values)))
    return sorted_values[rank - 1]


def simulate(
    class_weights_pct: Mapping[str, float],
    weighted_fee_pct: float,
    *,
    amount: float,
    horizon_years: int,
    monthly_contribution: float,
    history: Sequence[MonthlyReturn],
    paths: int = PATHS,
) -> tuple[list[list[float]], list[float], list[float]]:
    """Year-end values of every path (years[y][p], y = 0..H), plus A and B with V_H = A + m x B."""
    growth, annuity = blocks(monthly_returns(class_weights_pct, weighted_fee_pct, history))
    n_blocks = len(growth)
    years = [[float(amount)] * paths] + [[0.0] * paths for _ in range(horizon_years)]
    base, unit = [0.0] * paths, [0.0] * paths
    for p in range(paths):
        rng = Mulberry32(SEED + p)
        value, a, b = float(amount), float(amount), 0.0
        for y in range(1, horizon_years + 1):
            k = math.floor(rng.next() * n_blocks)
            g, s = growth[k], annuity[k]
            value = value * g + monthly_contribution * s
            a = a * g
            b = b * g + s
            years[y][p] = value
        base[p], unit[p] = a, b
    return years, base, unit


def project(
    class_weights_pct: Mapping[str, float],
    weighted_fee_pct: float,
    *,
    amount: float,
    horizon_years: int,
    monthly_contribution: float,
    target_amount: float | None,
    history: Sequence[MonthlyReturn],
    paths: int = PATHS,
) -> dict[str, Any]:
    years, base, unit = simulate(
        class_weights_pct,
        weighted_fee_pct,
        amount=amount,
        horizon_years=horizon_years,
        monthly_contribution=monthly_contribution,
        history=history,
        paths=paths,
    )
    contributed = amount + monthly_contribution * 12 * horizon_years
    band = []
    for y, values in enumerate(years):
        ordered = sorted(values)
        band.append({"year": y, **{f"p{q}": round2(percentile(ordered, q)) for q in PERCENTILES}})
    final = sorted(years[-1])

    probability_target = median_shortfall = required = None
    if target_amount is not None:
        reached = sum(1 for v in final if v >= target_amount)
        probability_target = round1(reached / paths * 100)
        shortfalls = sorted(target_amount - v for v in final if v < target_amount)
        median_shortfall = round2(percentile(shortfalls, 50)) if shortfalls else None
        needed = sorted(max(0.0, (target_amount - a) / b) if b > 0 else math.inf for a, b in zip(base, unit, strict=True))
        required = [
            {"confidence_pct": q, "monthly": float(math.ceil(_nearest_rank(needed, q)))}
            for q in CONFIDENCE_LEVELS
            if math.isfinite(_nearest_rank(needed, q))
        ]

    return {
        "paths": paths,
        "block_months": BLOCK_MONTHS,
        "seed": SEED,
        "total_contributed": round2(contributed),
        "years": band,
        "end": {f"p{q}": band[-1][f"p{q}"] for q in PERCENTILES},
        "probability_target_pct": probability_target,
        "probability_loss_pct": round1(sum(1 for v in final if v < contributed) / paths * 100),
        "median_shortfall": median_shortfall,
        "required_monthly": required,
    }
