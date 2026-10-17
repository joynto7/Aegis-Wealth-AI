"""Rounding and number formatting shared by the engines.

Python's round() is banker's rounding (round(0.125, 2) == 0.12). Money and
percentages here round half away from zero, which is what the worked
examples in Section 2.6.5 expect (S2: -6.725% -> -6.73%).
"""

from __future__ import annotations

from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal


def round_half(value: float, decimals: int = 0) -> float:
    """Round half away from zero. repr() first, so 2.675 rounds as written, not as its binary neighbour."""
    quantum = Decimal(1).scaleb(-decimals)
    return float(Decimal(repr(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def round2(value: float) -> float:
    return round_half(value, 2)


def round1(value: float) -> float:
    return round_half(value, 1)


def round4(value: float) -> float:
    return round_half(value, 4)


def units_for(amount: float, nav: float) -> float:
    """Fund units an amount buys at a NAV: floor(amount / NAV x 10,000) / 10,000, in exact decimals."""
    return float((Decimal(repr(amount)) / Decimal(repr(nav)) * 10_000).to_integral_value(rounding=ROUND_FLOOR) / 10_000)


def format_money(value: float, cents: bool = False) -> str:
    """Section 2.7.2: "CNY 200,000" in summaries, "CNY 200,000.00" in tables."""
    amount = round_half(value, 2 if cents else 0)
    return f"CNY {amount:,.2f}" if cents else f"CNY {amount:,.0f}"


def format_pct(value: float, decimals: int = 1) -> str:
    return f"{round_half(value, decimals):.{decimals}f}%"
