"""Allocation engine (Section 2.5.3): the seven steps in order, plus a plain-language reason for every item.

Steps: base weights, horizon cap, liquidity floor, rounding, product choice,
split, empty-class fallback. The liquidity floor uses exact fractions, so a
need of 7% of the amount floors cash at 7%, not 8% (float: 7.000000000000001).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

from app.engines.catalog import ASSET_CLASSES, ProductSpec
from app.engines.numbers import format_money, round2, round_half

SPLIT_THRESHOLD_PCT = 40
SHORT_HORIZON_YEARS = 3
SHORT_HORIZON_CAP_PCT = 20


@dataclass
class AllocationResult:
    items: list[dict[str, Any]]
    class_weights_pct: dict[str, float]
    notes: list[str] = field(default_factory=list)


def _sort_key(p: ProductSpec) -> tuple[float, int, str]:
    return (p.annual_fee_pct, p.liquidity_days, p.code)


def _liquidity_words(days: int) -> str:
    return "same-day access" if days == 0 else f"{days}-day access"


def candidates_for(
    asset_class: str,
    weight_pct: float,
    *,
    tier: int,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    products: tuple[ProductSpec, ...],
) -> list[ProductSpec]:
    """Step 5: risk level <= T, lock-up <= H x 12 months, minimum investment <= the slot amount; liquid-only cash when N > 0."""
    slot = weight_pct / 100 * amount
    found = [
        p
        for p in products
        if p.asset_class == asset_class
        and p.risk_level <= tier
        and p.lockup_months <= horizon_years * 12
        and p.min_investment <= slot
        and (asset_class != "cash" or near_term_need <= 0 or p.liquid)
    ]
    return sorted(found, key=_sort_key)


def _item(p: ProductSpec, weight_pct: float, amount: float, rationale: str) -> dict[str, Any]:
    return {
        "product_code": p.code,
        "name": p.name,
        "asset_class": p.asset_class,
        "risk_level": p.risk_level,
        "weight_pct": float(weight_pct),
        "amount": round2(weight_pct / 100 * amount),
        "rationale": rationale,
    }


def build_allocation(
    tier: int,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    *,
    model_portfolios: Mapping[int, Mapping[str, float]],
    products: tuple[ProductSpec, ...],
) -> AllocationResult:
    notes: list[str] = []
    weights = {c: float(model_portfolios[tier][c]) for c in ASSET_CLASSES}

    # 2. Horizon cap: under 3 years, equity + gold <= 20%; excess from equity first, then gold.
    if horizon_years < SHORT_HORIZON_YEARS:
        eg_total = weights["equity"] + weights["gold"]
        if eg_total > SHORT_HORIZON_CAP_PCT:
            excess = eg_total - SHORT_HORIZON_CAP_PCT
            from_equity = min(weights["equity"], excess)
            weights["equity"] -= from_equity
            weights["gold"] -= min(weights["gold"], excess - from_equity)
            weights["cash" if tier == 1 else "bond"] += excess
            notes.append(
                f"Your horizon is under {SHORT_HORIZON_YEARS} years, so equity and gold were capped at "
                f"{SHORT_HORIZON_CAP_PCT}% combined."
            )

    # 3. Liquidity floor: cash >= ceil(N / A x 100)%, shortfall taken pro rata from the other classes.
    if amount > 0 and near_term_need > 0:
        floor = math.ceil(Fraction(near_term_need) * 100 / Fraction(amount))
        if floor > weights["cash"]:
            shortfall = floor - weights["cash"]
            others = ("bond", "gold", "equity")
            others_total = sum(weights[c] for c in others)
            if others_total > 0:
                for c in others:
                    weights[c] -= min(weights[c], weights[c] / others_total * shortfall)
            weights["cash"] = float(floor)
            notes.append(
                f"At least {floor}% is kept in cash you can withdraw within 1 day, to cover your near-term need "
                f"of {format_money(near_term_need)}."
            )

    # 4. Rounding: whole percents, half up; the remainder goes to cash so the total is exactly 100.
    #    A negative remainder (e.g. 7 + 15 + 10 + 69 = 101) is taken from the largest non-cash
    #    class instead, so rounding can never undo the liquidity floor or the horizon cap
    #    (AT-06 requires both to hold).
    rounded = {c: round_half(weights[c]) for c in ASSET_CLASSES}
    remainder = 100 - sum(rounded.values())
    if remainder >= 0:
        rounded["cash"] += remainder
    else:
        for _ in range(int(-remainder)):
            largest = max(("bond", "gold", "equity"), key=lambda c: rounded[c])
            rounded[largest] -= 1
    if horizon_years < SHORT_HORIZON_YEARS:
        overflow = rounded["equity"] + rounded["gold"] - SHORT_HORIZON_CAP_PCT
        if overflow > 0:
            from_equity = min(rounded["equity"], overflow)
            rounded["equity"] -= from_equity
            rounded["gold"] -= overflow - from_equity
            rounded["cash" if tier == 1 else "bond"] += overflow

    final = dict(rounded)
    by_class: dict[str, list[dict[str, Any]]] = {c: [] for c in ASSET_CLASSES}
    common = dict(tier=tier, amount=amount, horizon_years=horizon_years, near_term_need=near_term_need, products=products)

    # 5-7. Non-cash classes first, so an empty class can move its weight into the cash slot.
    for cls in ("bond", "gold", "equity"):
        weight = rounded[cls]
        if weight <= 0:
            continue
        found = candidates_for(cls, weight, **common)
        if not found:
            final["cash"] += weight
            final[cls] = 0.0
            notes.append(f"No {cls} product suits tier {tier} with this amount and horizon, so its {weight:g}% moved to cash.")
            continue
        if weight > SPLIT_THRESHOLD_PCT and len(found) >= 2:
            p1, p2 = found[0], found[1]
            half = math.floor(weight / 2)
            w1, w2 = half + (int(weight) % 2), half
            why = (
                f"{cls.capitalize()} is {weight:g}% of this mix, above the {SPLIT_THRESHOLD_PCT}% limit for one product, "
                f"so it is split between the two lowest-fee {cls} products that suit tier {tier}."
            )
            by_class[cls].append(_item(p1, w1, amount, f"{why} This one charges {p1.annual_fee_pct:.2f}% a year."))
            by_class[cls].append(_item(p2, w2, amount, f"{why} This one charges {p2.annual_fee_pct:.2f}% a year."))
        else:
            p = found[0]
            lockup = f", locked for {p.lockup_months} months" if p.lockup_months else ""
            by_class[cls].append(
                _item(
                    p,
                    weight,
                    amount,
                    f"Lowest-fee {cls} product that suits tier {tier}: {p.annual_fee_pct:.2f}% a year, "
                    f"risk level R{p.risk_level}, {_liquidity_words(p.liquidity_days)}{lockup}.",
                )
            )

    if final["cash"] > 0:
        found = candidates_for("cash", final["cash"], **common)
        if found:
            p = found[0]
            if near_term_need > 0:
                why = (
                    f"Cash you can withdraw within 1 day ({_liquidity_words(p.liquidity_days)}, "
                    f"{p.annual_fee_pct:.2f}% a year), covering your near-term need of {format_money(near_term_need)}."
                )
            else:
                why = (
                    f"Lowest-fee cash product: {p.annual_fee_pct:.2f}% a year, risk level R{p.risk_level}, "
                    f"{_liquidity_words(p.liquidity_days)}."
                )
            by_class["cash"].append(_item(p, final["cash"], amount, why))

    items = [item for cls in ASSET_CLASSES for item in by_class[cls]]
    return AllocationResult(items=items, class_weights_pct={c: float(final[c]) for c in ASSET_CLASSES}, notes=notes)


def class_weights_of(items: list[dict[str, Any]]) -> dict[str, float]:
    weights = {c: 0.0 for c in ASSET_CLASSES}
    for item in items:
        weights[item["asset_class"]] += float(item["weight_pct"])
    return weights
