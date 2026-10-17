"""Stress tests (Section 2.5.4; AT-08)."""

from __future__ import annotations

from app.engines.stress import compute_stress
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_at08_stress_results(catalog):
    s = compute_stress({"cash": 15, "bond": 50, "gold": 10, "equity": 25}, 200_000, catalog.scenarios)
    assert [x["loss_cny"] for x in s] == [-12_000, -13_450, -25_900]
    assert [x["loss_pct"] for x in s] == [-6.0, -6.73, -12.95]
    assert s[1]["contributions"] == {"cash": 150, "bond": -8000, "gold": -600, "equity": -5000}
