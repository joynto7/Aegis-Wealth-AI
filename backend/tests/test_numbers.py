"""Rounding and money formatting (Section 2.6.5, 2.7.2)."""

from __future__ import annotations

from app.engines.numbers import format_money, round_half
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_round_half_away_from_zero():
    assert round_half(-6.725, 2) == -6.73  # S2 in Section 2.6.5; Python's round() gives -6.72
    assert round_half(2.675, 2) == 2.68
    assert round_half(12.5) == 13
    assert format_money(1460.89) == "CNY 1,461"
    assert format_money(30000, cents=True) == "CNY 30,000.00"
