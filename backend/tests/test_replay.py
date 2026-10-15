"""Historical replay (Section 2.5.2)."""

from __future__ import annotations

import pytest

from app.engines.replay import run_replay
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_replay_e1_tier4(catalog):
    r = run_replay(
        catalog.episode("E1"), 4, catalog.model_portfolios[4], catalog.history, data_label="Illustrative", data_as_of="2026-09-30"
    )
    assert len(r["series"]) == 24  # 2007-11 to 2009-10
    assert r["series"][0]["month"] == "2007-11" and r["series"][-1]["month"] == "2009-10"
    assert r["lowest_month"] == "2009-02"
    assert r["max_drawdown_pct"] == pytest.approx(30.6)
    assert r["start_value"] == 100_000 and r["data_label"] == "Illustrative"
