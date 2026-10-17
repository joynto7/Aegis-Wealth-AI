"""Portfolio drift and rebalancing trades (additions). The worked example: the Scenario 1 proposal (tier 3, CNY 200,000)
bought at the data date, after six simulated months of the 2009 rally. The mock API checks the same figures
(frontend/scripts/verify.ts)."""

from __future__ import annotations

from app.engines import drift, market, rebalance
from app.engines.numbers import round2, units_for

SCENARIO_1 = {"DEP-01": 15, "SBF-01": 25, "SBF-02": 25, "GLD-01": 10, "IDX-01": 25}


def _items(catalog, weights):
    return [
        {
            "product_code": code,
            "name": catalog.product(code).name,
            "asset_class": catalog.product(code).asset_class,
            "weight_pct": w,
        }
        for code, w in weights.items()
    ]


def _holdings(catalog, months=6, weights=SCENARIO_1, amount=200_000):
    """The units bought at the base NAV, valued after `months` simulated months."""
    start = market.replay_start(catalog.history, "2009-03")
    navs = market.navs(catalog.products, catalog.history, start, months)
    out = []
    for code, w in weights.items():
        p = catalog.product(code)
        units = units_for(round2(w / 100 * amount), p.nav)
        out.append(
            {
                "product_code": code,
                "name": p.name,
                "asset_class": p.asset_class,
                "units": units,
                "value": round2(units * navs[code]),
            }
        )
    return out, navs


def test_six_months_of_the_rally_push_equity_beyond_the_band(catalog):
    held, _ = _holdings(catalog)
    result = drift.measure(held, _items(catalog, SCENARIO_1), band_pp=5)
    assert result["total_value"] == 226_295.1
    assert [(c["asset_class"], c["current_pct"], c["drift_pp"], c["outside_band"]) for c in result["classes"]] == [
        ("cash", 13.3, -1.7, False),
        ("bond", 45.89, -4.11, False),
        ("gold", 10.14, 0.14, False),
        ("equity", 30.66, 5.66, True),
    ]
    assert result["largest"] == {"asset_class": "equity", "drift_pp": 5.66}
    assert result["portfolio_drift_pct"] == 5.8 and result["outside_band"] is True
    assert {p["product_code"]: p["drift_pp"] for p in result["products"]} == {
        "DEP-01": -1.7,
        "SBF-01": -2.05,
        "SBF-02": -2.05,
        "GLD-01": 0.14,
        "IDX-01": 5.66,
    }


def test_the_band_is_compared_on_the_rounded_figure_and_is_exclusive(catalog):
    held, _ = _holdings(catalog, months=5)
    result = drift.measure(held, _items(catalog, SCENARIO_1), band_pp=5)
    equity = result["classes"][3]
    assert equity["drift_pp"] == 5.12 and equity["outside_band"]
    at_the_band = drift.measure(held, _items(catalog, SCENARIO_1), band_pp=5.12)
    assert at_the_band["outside_band"] is False  # 5.12 is not more than a 5.12 band


def test_a_holding_outside_the_target_counts_as_drift_and_nothing_is_negative_zero(catalog):
    held, _ = _holdings(catalog, months=0)
    target = _items(catalog, {**SCENARIO_1})
    on_target = drift.measure(held, target, band_pp=5)
    assert all(str(c["drift_pp"]) != "-0.0" for c in on_target["classes"]) and on_target["portfolio_drift_pct"] == 0.0
    extra = held + [
        {
            "product_code": "HGF-01",
            "name": "Sample High-Growth Thematic Fund A",
            "asset_class": "equity",
            "units": 1,
            "value": 20_000.0,
        }
    ]
    result = drift.measure(extra, target, band_pp=5)
    hgf = next(p for p in result["products"] if p["product_code"] == "HGF-01")
    assert hgf["target_pct"] == 0.0 and hgf["drift_pp"] == hgf["current_pct"] > 0


def test_an_empty_portfolio_has_no_drift():
    result = drift.measure([], [], band_pp=5)
    assert result["total_value"] == 0.0 and result["outside_band"] is False and result["portfolio_drift_pct"] == 0.0


# --- rebalancing trades -----------------------------------------------------------------------
def test_the_trades_sell_what_is_over_target_and_buy_what_is_under(catalog):
    held, navs = _holdings(catalog)
    result = rebalance.plan(held, _items(catalog, SCENARIO_1), amount=226_295.1, navs=navs, cash=300_000.01)
    assert [(t["side"], t["product_code"], t["units"], t["amount"]) for t in result["trades"]] == [
        ("sell", "GLD-01", 122.8953, 326.41),
        ("sell", "IDX-01", 2672.5613, 12800.5),
        ("buy", "DEP-01", 3822.5089, 3836.27),
        ("buy", "SBF-01", 4128.2755, 4644.31),
        ("buy", "SBF-02", 4216.6712, 4646.35),
    ]
    assert (result["sell_total"], result["buy_total"], result["net_cash"], result["turnover_pct"]) == (
        13126.91,
        13126.93,
        -0.02,
        5.8,
    )
    # After the trades every class is back within a cent or two of its target.
    after = {h["product_code"]: h["units"] for h in held}
    for t in result["trades"]:
        after[t["product_code"]] += t["units"] if t["side"] == "buy" else -t["units"]
    values = {code: units * navs[code] for code, units in after.items()}
    total = sum(values.values())
    for code, w in SCENARIO_1.items():
        assert abs(values[code] / total * 100 - w) < 0.01


def test_a_product_the_target_no_longer_holds_is_sold_in_full(catalog):
    held, navs = _holdings(catalog)
    target = _items(catalog, {"DEP-01": 15, "SBF-01": 50, "GLD-01": 10, "IDX-01": 25})  # SBF-02 dropped
    result = rebalance.plan(held, target, amount=226_295.1, navs=navs, cash=0)
    sbf02 = next(t for t in result["trades"] if t["product_code"] == "SBF-02")
    assert sbf02["side"] == "sell" and sbf02["units"] == 47125.3534 and sbf02["to_pct"] == 0.0


def test_tiny_gaps_are_left_alone_and_purchases_never_outspend_the_cash(catalog):
    held, navs = _holdings(catalog, months=0)
    assert rebalance.plan(held, _items(catalog, SCENARIO_1), amount=200_000, navs=navs, cash=0)["trades"] == []
    six, navs6 = _holdings(catalog)
    # With no spare cash the purchases shrink to what the sales raise.
    result = rebalance.plan(six, _items(catalog, SCENARIO_1), amount=226_295.1, navs=navs6, cash=0)
    assert result["buy_total"] <= result["sell_total"] and result["net_cash"] >= 0
