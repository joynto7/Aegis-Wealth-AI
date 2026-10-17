"""Goal projection engine (addition): determinism, the generator's JavaScript twin, and the properties a
client relies on (bands in order, contributions help, longer horizons extend the same paths)."""

from __future__ import annotations

from app.engines.projection import PATHS, Mulberry32, project

TIER3 = {"cash": 15.0, "bond": 50.0, "gold": 10.0, "equity": 25.0}


def run(catalog, weights=TIER3, fee=0.25, amount=200_000, horizon=8, monthly=0.0, target=260_000):
    return project(
        weights,
        fee,
        amount=amount,
        horizon_years=horizon,
        monthly_contribution=monthly,
        target_amount=target,
        history=catalog.history,
    )


def test_the_generator_matches_its_javascript_twin():
    # The same three values as mulberry32(1) in JavaScript (frontend/src/mocks/engines/projection.ts).
    rng = Mulberry32(1)
    assert [round(rng.next(), 10) for _ in range(3)] == [0.6270739406, 0.0027357212, 0.52744704]


def test_the_same_question_gets_the_same_answer(catalog):
    assert run(catalog) == run(catalog)


def test_worked_example(catalog):
    # Tier 3 mix of the Scenario 1 proposal (fee 0.25%), CNY 200,000 for 8 years, target CNY 260,000.
    # The mock API's port must give the same numbers (scripts/verify.ts).
    result = run(catalog)
    assert result["paths"] == PATHS and len(result["years"]) == 9
    assert result["end"] == {"p10": 203151.96, "p25": 221238.15, "p50": 240303.08, "p75": 257594.43, "p90": 271772.18}
    assert (result["probability_target_pct"], result["probability_loss_pct"], result["median_shortfall"]) == (22.5, 8.9, 27265.66)
    assert result["required_monthly"] == [
        {"confidence_pct": 50, "monthly": 186.0},
        {"confidence_pct": 75, "monthly": 386.0},
        {"confidence_pct": 90, "monthly": 603.0},
    ]


def test_bands_are_ordered_and_start_from_the_amount(catalog):
    result = run(catalog, monthly=1_000, horizon=15)
    assert result["years"][0] == {"year": 0, "p10": 200000, "p25": 200000, "p50": 200000, "p75": 200000, "p90": 200000}
    for band in result["years"]:
        assert band["p10"] <= band["p25"] <= band["p50"] <= band["p75"] <= band["p90"]
    assert result["total_contributed"] == 200_000 + 1_000 * 12 * 15


def test_a_longer_horizon_extends_the_same_paths(catalog):
    short, long = run(catalog, horizon=5), run(catalog, horizon=12)
    assert long["years"][:6] == short["years"]


def test_contributing_more_never_lowers_the_chance(catalog):
    chances = [run(catalog, monthly=m, target=300_000)["probability_target_pct"] for m in (0, 250, 500, 1_000, 2_000)]
    assert chances == sorted(chances)
    assert chances[-1] > chances[0]


def test_the_required_contribution_delivers_its_confidence(catalog):
    base = run(catalog, target=300_000)
    for level in base["required_monthly"]:
        again = run(catalog, monthly=level["monthly"], target=300_000)
        assert again["probability_target_pct"] >= level["confidence_pct"]


def test_cash_never_loses_and_misses_have_a_size(catalog):
    cash = run(catalog, weights={"cash": 100.0, "bond": 0.0, "gold": 0.0, "equity": 0.0}, fee=0.0, target=10_000_000)
    assert cash["probability_loss_pct"] == 0 and cash["probability_target_pct"] == 0
    assert cash["median_shortfall"] > 0


def test_no_target_means_no_target_figures(catalog):
    result = run(catalog, target=None)
    assert result["probability_target_pct"] is None and result["required_monthly"] is None and result["median_shortfall"] is None
