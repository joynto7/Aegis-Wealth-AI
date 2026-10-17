"""Rebalancing trades (addition): the orders that bring live holdings back to a target mix.

Each product's goal is its target weight times the portfolio's live value. A product above its goal sells the excess,
one below buys the gap, and one the target no longer holds sells every unit. Units are floored to 4 decimals at the
current NAV, as at execution, so a sale raises a little less than its gap and a purchase costs a little less than its
amount. Gaps under CNY 1 are left alone. Sales come first and fund the purchases; the account's uninvested cash covers
what rounding leaves, and if even that falls short, the largest purchase shrinks to fit.

The client sees every trade before confirming. The trades are priced at one market month and one set of holdings, and
cannot execute once either has changed (services/monitoring.py). Pure: holdings, target and NAVs in, trades out. The
mock API ports it (frontend/src/mocks/engines/rebalance.ts).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.engines.numbers import round2, units_for

MIN_TRADE = 1.0


def plan(
    holdings: Sequence[Mapping[str, Any]],
    target_items: Sequence[Mapping[str, Any]],
    *,
    amount: float,
    navs: Mapping[str, float],
    cash: float,
    min_trade: float = MIN_TRADE,
) -> dict[str, Any]:
    """holdings: product_code, name, asset_class, units, value. target_items: product_code, name, asset_class, weight_pct."""
    held = {h["product_code"]: h for h in holdings}
    target = {t["product_code"]: t for t in target_items}
    codes = [t["product_code"] for t in target_items] + [h["product_code"] for h in holdings if h["product_code"] not in target]
    sells: list[dict[str, Any]] = []
    buys: list[dict[str, Any]] = []
    for code in codes:
        entry = target.get(code) or held[code]
        nav = float(navs[code])
        units_held = float(held[code]["units"]) if code in held else 0.0
        current = float(held[code]["value"]) if code in held else 0.0
        weight = float(target[code]["weight_pct"]) if code in target else 0.0
        gap = round2(round2(weight / 100 * amount) - current)
        trade = {
            "product_code": code,
            "name": entry["name"],
            "asset_class": entry["asset_class"],
            "nav": nav,
            "from_pct": round2(current / amount * 100) if amount > 0 else 0.0,
            "to_pct": round2(weight),
        }
        if weight <= 0 and units_held > 0:
            sells.append({**trade, "side": "sell", "units": units_held, "amount": round2(units_held * nav)})
        elif gap <= -min_trade and units_held > 0:
            units = min(units_held, units_for(-gap, nav))
            if units > 0:
                sells.append({**trade, "side": "sell", "units": units, "amount": round2(units * nav)})
        elif gap >= min_trade:
            units = units_for(gap, nav)
            if units > 0:
                buys.append({**trade, "side": "buy", "units": units, "amount": round2(units * nav)})

    available = round2(cash + sum(s["amount"] for s in sells))
    shortfall = round2(sum(b["amount"] for b in buys) - available)
    for buy in sorted(buys, key=lambda b: -b["amount"]):
        if shortfall <= 0:
            break
        units = units_for(max(0.0, round2(buy["amount"] - shortfall)), buy["nav"])
        cost = round2(units * buy["nav"])
        shortfall = round2(shortfall - (buy["amount"] - cost))
        buy.update(units=units, amount=cost)
    buys = [b for b in buys if b["units"] > 0]

    sell_total = round2(sum(s["amount"] for s in sells))
    buy_total = round2(sum(b["amount"] for b in buys))
    return {
        "trades": sells + buys,
        "sell_total": sell_total,
        "buy_total": buy_total,
        "net_cash": round2(sell_total - buy_total),
        "turnover_pct": round2(sell_total / amount * 100) if amount > 0 else 0.0,
    }
