"""Fee comparison (Section 2.5.4): fee cost = A(1+g)^H - A(1+g-f)^H; end value after fees = A(1+g-f)^H.

g is an assumed gross return per asset class for illustration only, not a forecast.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.engines.catalog import ProductSpec
from app.engines.numbers import round1, round2

DATA_LABEL = "Sample data; returns are an assumption for illustration"


def compare_products(
    products: list[ProductSpec], amount: float, horizon_years: int, gross_return: Mapping[str, float]
) -> dict[str, Any]:
    items = []
    for p in products:
        g = gross_return[p.asset_class]
        f = p.annual_fee_pct / 100
        gross_end = amount * (1 + g) ** horizon_years
        net_end = amount * (1 + g - f) ** horizon_years
        items.append(
            {
                "code": p.code,
                "name": p.name,
                "risk_level": p.risk_level,
                "suitable": None,
                "annual_fee_pct": p.annual_fee_pct,
                "assumed_return_pct": round1(g * 100),
                "fee_cost": round2(gross_end - net_end),
                "end_value_after_fees": round2(net_end),
                "liquidity_days": p.liquidity_days,
                "lockup_months": p.lockup_months,
            }
        )
    cheapest = min(items, key=lambda i: i["fee_cost"]) if items else None
    return {
        "amount": round2(amount),
        "horizon_years": horizon_years,
        "items": items,
        "cheapest_code": cheapest["code"] if cheapest else "",
        "data_label": DATA_LABEL,
    }
