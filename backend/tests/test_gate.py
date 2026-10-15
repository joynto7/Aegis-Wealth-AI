"""Compliance gate R-01 to R-09 (Section 2.5.5; AT-07)."""

from __future__ import annotations

from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_gate_pass_for_the_example(catalog):
    g = gate_for(catalog, allocate(catalog).items)
    assert g["decision"] == "PASS" and len(g["rules"]) == 9
    assert all(r["detail"] for r in g["rules"])  # every rule shows its measured value


def test_at07_product_above_tier_is_rejected_by_r02(catalog):
    items = [item(catalog, c, w) for c, w in (("DEP-01", 15), ("SBF-01", 25), ("SBF-02", 25), ("GLD-01", 10), ("HGF-01", 25))]
    g = gate_for(catalog, items)
    assert g["decision"] == "REJECT" and "R-02" in failed(g)


def test_at07_one_product_at_41_percent_is_rejected_by_r03(catalog):
    items = [item(catalog, c, w) for c, w in (("DEP-01", 15), ("SBF-01", 41), ("SBF-02", 9), ("GLD-01", 10), ("IDX-01", 25))]
    g = gate_for(catalog, items)
    assert g["decision"] == "REJECT" and "R-03" in failed(g)


def test_r01_r04_r05_r06(catalog):
    assert "R-01" in failed(gate_for(catalog, [item(catalog, "DEP-01", 90)]))
    g = gate_for(catalog, [item(catalog, "SBF-02", 40), item(catalog, "SBF-03", 40), item(catalog, "DEP-01", 20)], need=60_000)
    assert "R-04" in failed(g)  # only 20% is liquid within a day
    g = gate_for(catalog, [item(catalog, "DEP-01", 30), item(catalog, "SBF-01", 40), item(catalog, "IDX-01", 30)], horizon=2)
    assert "R-05" in failed(g)
    g = gate_for(catalog, [item(catalog, "DEP-01", 60), item(catalog, "BND-03", 40)], horizon=2)
    assert "R-06" in failed(g)  # 36-month lock-up, 24-month horizon


def test_soft_rules_give_warning(catalog):
    items = [item(catalog, c, w) for c, w in (("DEP-01", 15), ("SBF-01", 25), ("SBF-02", 25), ("GLD-01", 10), ("IDX-01", 25))]
    g = gate_for(catalog, items, max_loss=5)
    assert g["decision"] == "WARNING"
    assert set(failed(g)) == {"R-08", "R-09"}
