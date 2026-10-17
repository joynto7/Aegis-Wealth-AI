"""Stress tests (Section 2.5.4): hypothetical instant shocks per asset class, not forecasts.

loss_%(S) = sum_c w_c shock_c(S);  loss_CNY(S) = A * loss_%(S).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.engines.catalog import ASSET_CLASSES, Scenario
from app.engines.numbers import round2


def compute_stress(
    class_weights_pct: Mapping[str, float], amount: float, scenarios: tuple[Scenario, ...]
) -> list[dict[str, Any]]:
    results = []
    for s in scenarios:
        loss = sum(class_weights_pct.get(c, 0.0) / 100 * s.shocks[c] for c in ASSET_CLASSES)
        results.append(
            {
                "scenario": s.id,
                "name": s.name,
                "loss_pct": round2(loss * 100),
                "loss_cny": round2(amount * loss),
                "contributions": {c: round2(amount * class_weights_pct.get(c, 0.0) / 100 * s.shocks[c]) for c in ASSET_CLASSES},
            }
        )
    return results


def worst_scenario(stress: list[dict[str, Any]]) -> dict[str, Any]:
    return min(stress, key=lambda s: s["loss_pct"])
