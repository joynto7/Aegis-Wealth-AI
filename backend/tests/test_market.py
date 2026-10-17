"""The simulated market clock (addition): replay order, NAVs, dates and moves. The mock API checks the same figures
(frontend/scripts/verify.ts)."""

from __future__ import annotations

from app.engines import market


def _start(catalog) -> int:
    return market.replay_start(catalog.history, catalog.market["replay_from"])


def test_the_clock_replays_the_history_from_march_2009_and_wraps(catalog):
    start = _start(catalog)
    history = catalog.history
    assert history[start].month == "2009-03"
    assert [market.applied_month(history, start, k).month for k in (1, 2, 6)] == ["2009-03", "2009-04", "2009-08"]
    last = len(history) - start  # the advance that replays the last month of the file
    assert market.applied_month(history, start, last).month == "2026-09"
    assert market.applied_month(history, start, last + 1).month == "2006-01"


def test_navs_compound_from_the_base_nav_by_asset_class(catalog):
    start = _start(catalog)
    assert market.navs(catalog.products, catalog.history, start, 0) == {p.code: p.nav for p in catalog.products}
    navs = market.navs(catalog.products, catalog.history, start, 6)
    # The worked example: six months of the 2009 rally.
    assert {code: navs[code] for code in ("DEP-01", "SBF-01", "SBF-02", "GLD-01", "IDX-01")} == {
        "DEP-01": 1.0036,
        "SBF-01": 1.125,
        "SBF-02": 1.1019,
        "GLD-01": 2.656,
        "IDX-01": 4.7896,
    }
    growth = market.growth(catalog.history, start, 6)
    assert round(growth["equity"], 6) == 1.387489 and round(growth["bond"], 6) == 1.038575
    # Every product in a class moves by the same growth, rounded to 4 decimals from its own base NAV.
    for p in catalog.products:
        assert navs[p.code] == round(p.nav * growth[p.asset_class], 4)


def test_the_nav_is_computed_from_the_base_every_time(catalog):
    start = _start(catalog)
    stepwise = {p.code: p.nav for p in catalog.products}
    for k in range(1, 13):
        stepwise = market.navs(catalog.products, catalog.history, start, k)
    assert stepwise == market.navs(catalog.products, catalog.history, start, 12)


def test_market_dates_are_month_ends():
    dates = [market.market_date("2026-09-30", k) for k in (0, 1, 5, 15, 17, 29)]
    assert dates == ["2026-09-30", "2026-10-31", "2027-02-28", "2027-12-31", "2028-02-29", "2029-02-28"]


def test_describe_reports_the_last_move_and_the_moves_since_the_start(catalog):
    start = _start(catalog)
    before = market.describe(catalog.history, start=start, months=0, start_date="2026-09-30")
    assert before["replayed"] is None and before["last_returns_pct"] is None and before["next_replay"] == "2009-03"
    assert before["since_start_pct"] == {"cash": 0.0, "bond": 0.0, "gold": 0.0, "equity": 0.0}
    after = market.describe(catalog.history, start=start, months=6, start_date="2026-09-30")
    assert (after["month"], after["as_of"], after["replayed"], after["next_replay"]) == (6, "2027-03-31", "2009-08", "2009-09")
    assert after["last_returns_pct"] == {"cash": 0.05, "bond": 0.4, "gold": 1.0, "equity": 3.0}
    assert after["since_start_pct"] == {"cash": 0.36, "bond": 3.86, "gold": 14.78, "equity": 38.75}
