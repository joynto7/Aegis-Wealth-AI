"""Portfolio drift (addition): how far the live holdings have moved from the mix the client agreed to.

For each asset class c, with live value V_c, total value V and target weight T_c (from the latest executed proposal):

    w_c = V_c / V x 100        drift_c = w_c - T_c   (percentage points)

A class is outside its band when |drift_c| is more than the band (rules.json drift_band_pp, 5 points), compared on the
rounded figure the client sees. Portfolio drift is half the sum of |drift_c|: the share of the portfolio sitting in
the wrong class, and so the least that must be traded to restore the class targets. FINRA's report on digital advice
describes a portfolio-drift trigger of this kind.

Each product's drift is reported the same way, so the client can see which holding moved. Pure: holdings and target
in, figures out. The mock API ports it (frontend/src/mocks/engines/drift.ts).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.engines.catalog import ASSET_CLASSES
from app.engines.numbers import round2


def measure(
    holdings: Sequence[Mapping[str, Any]], target_items: Sequence[Mapping[str, Any]], *, band_pp: float
) -> dict[str, Any]:
    """holdings: product_code, name, asset_class, value. target_items: product_code, name, asset_class, weight_pct."""
    total = sum(float(h["value"]) for h in holdings)
    target = {c: 0.0 for c in ASSET_CLASSES}
    for t in target_items:
        target[t["asset_class"]] += float(t["weight_pct"])
    held = {c: 0.0 for c in ASSET_CLASSES}
    for h in holdings:
        held[h["asset_class"]] += float(h["value"])

    def share(value: float) -> float:
        return value / total * 100 if total > 0 else 0.0

    def points(value: float) -> float:
        return round2(value) + 0.0  # + 0.0 turns a rounded -0.0 into 0.0

    classes = []
    for c in ASSET_CLASSES:
        drift = points(share(held[c]) - target[c])
        classes.append(
            {
                "asset_class": c,
                "target_pct": round2(target[c]),
                "current_pct": round2(share(held[c])),
                "drift_pp": drift,
                "outside_band": abs(drift) > band_pp,
            }
        )
    largest = classes[0]
    for entry in classes[1:]:
        if abs(entry["drift_pp"]) > abs(largest["drift_pp"]):
            largest = entry

    by_code = {h["product_code"]: h for h in holdings}
    in_target = {t["product_code"] for t in target_items}
    products = []
    for t in target_items:
        value = float(by_code[t["product_code"]]["value"]) if t["product_code"] in by_code else 0.0
        products.append((t, value, float(t["weight_pct"])))
    for h in holdings:
        if h["product_code"] not in in_target:
            products.append((h, float(h["value"]), 0.0))

    return {
        "total_value": round2(total),
        "band_pp": float(band_pp),
        "classes": classes,
        "products": [
            {
                "product_code": entry["product_code"],
                "name": entry["name"],
                "asset_class": entry["asset_class"],
                "target_pct": round2(weight),
                "current_pct": round2(share(value)),
                "drift_pp": points(share(value) - weight),
                "value": round2(value),
            }
            for entry, value, weight in products
        ],
        "largest": {"asset_class": largest["asset_class"], "drift_pp": largest["drift_pp"]},
        "portfolio_drift_pct": round2(sum(abs(share(held[c]) - target[c]) for c in ASSET_CLASSES) / 2),
        "outside_band": any(entry["outside_band"] for entry in classes),
    }
