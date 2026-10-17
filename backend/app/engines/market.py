"""Simulated market clock (addition): replays the illustrative monthly history, one month at a time.

Month 0 is the data as of market.json's start_date, the products' NAV date. The k-th advance applies the k-th month of
the history counted from replay_from, wrapping to the first month after the last. A product's NAV after k months is
its base NAV times the growth of its asset class over the months applied:

    NAV_k = round4(NAV_0 x prod_{i=1..k} (1 + r_class,i))

It is computed from the base NAV every time, not month on month, so rounding never accumulates and the mock API
(frontend/src/mocks/engines/market.ts) gets the same figures. Month k is dated the last day of the k-th month after
start_date.

Illustrative only: replayed synthetic history, not a forecast and not real prices.
"""

from __future__ import annotations

import calendar
from collections.abc import Sequence
from typing import Any

from app.engines.catalog import ASSET_CLASSES, MonthlyReturn, ProductSpec
from app.engines.numbers import round2, round4


def replay_start(history: Sequence[MonthlyReturn], replay_from: str) -> int:
    """The index of the first month to replay."""
    for i, row in enumerate(history):
        if row.month == replay_from:
            return i
    raise ValueError(f"replay_from {replay_from} is not in the history")


def applied_month(history: Sequence[MonthlyReturn], start: int, step: int) -> MonthlyReturn:
    """The history month the step-th advance applies (step 1 is the first)."""
    return history[(start + step - 1) % len(history)]


def growth(history: Sequence[MonthlyReturn], start: int, months: int) -> dict[str, float]:
    """prod (1 + r) per asset class over the first `months` advances, multiplied in order."""
    g = {c: 1.0 for c in ASSET_CLASSES}
    for step in range(1, months + 1):
        row = applied_month(history, start, step)
        for c in ASSET_CLASSES:
            g[c] *= 1 + row.of(c)
    return g


def navs(products: Sequence[ProductSpec], history: Sequence[MonthlyReturn], start: int, months: int) -> dict[str, float]:
    """Every product's NAV after `months` advances, to 4 decimals."""
    g = growth(history, start, months)
    return {p.code: round4(p.nav * g[p.asset_class]) for p in products}


def market_date(start_date: str, months: int) -> str:
    """The last day of the month `months` after start_date's month, as YYYY-MM-DD."""
    year, month, _ = (int(part) for part in start_date.split("-"))
    y, m = divmod(year * 12 + (month - 1) + months, 12)
    m += 1
    return f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


def describe(history: Sequence[MonthlyReturn], *, start: int, months: int, start_date: str) -> dict[str, Any]:
    """The clock after `months` advances: its date, the month last replayed, and the moves by class in percent."""
    last = applied_month(history, start, months) if months > 0 else None
    g = growth(history, start, months)
    return {
        "month": months,
        "as_of": market_date(start_date, months),
        "replayed": last.month if last else None,
        "next_replay": applied_month(history, start, months + 1).month,
        "last_returns_pct": {c: round2(last.of(c) * 100) for c in ASSET_CLASSES} if last else None,
        "since_start_pct": {c: round2((g[c] - 1) * 100) for c in ASSET_CLASSES},
    }
