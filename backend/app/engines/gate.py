"""Compliance gate (Section 2.5.5): six hard rules and three soft rules, run on every proposal version.

Decision: REJECT if any hard rule fails; otherwise WARNING if any soft rule
flags; otherwise PASS. Each rule also returns `detail`, the measured value
against its limit, so every decision shows its reason, pass or fail
(Section 2.7.1, principle 3).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.engines.catalog import ProductSpec
from app.engines.numbers import format_money, round1, round2
from app.engines.stress import worst_scenario


def _rule(rule_id: str, kind: str, passed: bool, message: str | None, detail: str) -> dict[str, Any]:
    return {
        "id": rule_id,
        "type": kind,
        "result": "pass" if passed else "fail",
        "message": None if passed else message,
        "detail": detail,
    }


def evaluate_gate(
    *,
    items: list[dict[str, Any]],
    class_weights_pct: Mapping[str, float],
    metrics: Mapping[str, float],
    stress: list[dict[str, Any]],
    tier: int,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    max_acceptable_loss_pct: float,
    by_code: Mapping[str, ProductSpec],
    thresholds: Mapping[str, float],
) -> dict[str, Any]:
    tolerance = float(thresholds["allocation_total_tolerance_pct"])
    max_single = float(thresholds["max_single_product_pct"])
    short_years = int(thresholds["short_horizon_years"])
    short_cap = float(thresholds["short_horizon_equity_gold_cap_pct"])
    max_fee = float(thresholds["max_weighted_fee_pct"])
    rules: list[dict[str, Any]] = []

    # R-01 Allocation total, over the items themselves.
    total = sum(float(i["weight_pct"]) for i in items)
    rules.append(
        _rule("R-01", "hard", abs(total - 100) <= tolerance, "Weights must add up to 100%.", f"Weights total {round2(total):g}%.")
    )

    # R-02 Suitability: no product above the client's tier.
    unsuitable = [i for i in items if int(i["risk_level"]) > tier]
    highest = max((int(i["risk_level"]) for i in items), default=0)
    rules.append(
        _rule(
            "R-02",
            "hard",
            not unsuitable,
            " ".join(f"{i['name']} is risk level {i['risk_level']}, above your tier {tier}." for i in unsuitable),
            f"Highest product risk level is R{highest}; your tier is {tier}.",
        )
    )

    # R-03 Concentration: every non-cash product <= 40%.
    non_cash = [i for i in items if i["asset_class"] != "cash"]
    over = [i for i in non_cash if float(i["weight_pct"]) > max_single]
    largest = max((float(i["weight_pct"]) for i in non_cash), default=0.0)
    rules.append(
        _rule(
            "R-03",
            "hard",
            not over,
            " ".join(f"{i['name']} is {float(i['weight_pct']):g}% of the portfolio; the limit is {max_single:g}%." for i in over),
            f"Largest non-cash product is {round1(largest):g}%; the limit is {max_single:g}%.",
        )
    )

    # R-04 Liquidity reserve: liquid share x A >= N, compared in whole cents.
    available = round2(float(metrics["liquid_share_pct"]) / 100 * amount)
    need = round2(near_term_need)
    rules.append(
        _rule(
            "R-04",
            "hard",
            available >= need,
            f"Only {format_money(available, cents=True)} is available within 1 day; you need {format_money(need, cents=True)}.",
            f"{format_money(available)} is available within 1 day; you need {format_money(need)}.",
        )
    )

    # R-05 Horizon: under 3 years, equity + gold <= 20%.
    eg = float(class_weights_pct.get("equity", 0.0)) + float(class_weights_pct.get("gold", 0.0))
    short = horizon_years < short_years
    rules.append(
        _rule(
            "R-05",
            "hard",
            (not short) or eg <= short_cap,
            f"With under {short_years} years, equity and gold may be at most {short_cap:g}%.",
            (
                f"Equity and gold are {round1(eg):g}%; the limit under {short_years} years is {short_cap:g}%."
                if short
                else f"Your horizon is {horizon_years} years, so the {short_cap:g}% cap on equity and gold does not apply."
            ),
        )
    )

    # R-06 Lock-up: every product's lock-up <= H x 12 months.
    horizon_months = horizon_years * 12
    locked = [(i, by_code[i["product_code"]].lockup_months) for i in items]
    beyond = [(i, m) for i, m in locked if m > horizon_months]
    longest = max((m for _, m in locked), default=0)
    rules.append(
        _rule(
            "R-06",
            "hard",
            not beyond,
            " ".join(f"{i['name']} locks money for {m} months, beyond your horizon." for i, m in beyond),
            f"Longest lock-up is {longest} months; your horizon is {horizon_months} months.",
        )
    )

    # R-07 Fee level (soft): weighted annual fee <= 1.00%.
    fee = float(metrics["weighted_fee_pct"])
    rules.append(
        _rule(
            "R-07",
            "soft",
            fee <= max_fee,
            f"The average annual fee is {fee:.2f}%, above {max_fee:.2f}%.",
            f"Weighted annual fee is {fee:.2f}%; the limit is {max_fee:.2f}%.",
        )
    )

    # R-08 Drawdown tolerance (soft): historical maximum drawdown <= maximum acceptable loss.
    mdd = float(metrics["max_drawdown_pct"])
    loss_limit = float(max_acceptable_loss_pct)
    rules.append(
        _rule(
            "R-08",
            "soft",
            mdd <= loss_limit,
            f"This mix once fell {mdd:.1f}%; you said you can accept {loss_limit:g}%.",
            f"Historical maximum drawdown is {mdd:.1f}%; you can accept {loss_limit:g}%.",
        )
    )

    # R-09 Stress tolerance (soft): worst scenario loss <= maximum acceptable loss.
    worst = worst_scenario(stress)
    worst_loss = abs(float(worst["loss_pct"]))
    rules.append(
        _rule(
            "R-09",
            "soft",
            worst_loss <= loss_limit,
            f"In {worst['name']} this mix could lose {worst_loss:.1f}%, more than your {loss_limit:g}%.",
            f"Worst hypothetical loss is {worst_loss:.2f}% ({worst['name']}); you can accept {loss_limit:g}%.",
        )
    )

    hard_fail = any(r["type"] == "hard" and r["result"] == "fail" for r in rules)
    soft_fail = any(r["type"] == "soft" and r["result"] == "fail" for r in rules)
    decision = "REJECT" if hard_fail else "WARNING" if soft_fail else "PASS"
    return {"decision": decision, "rules": rules, "acknowledged_rule_ids": []}


def failed_rule_ids(gate: Mapping[str, Any], kind: str | None = None) -> list[str]:
    return [r["id"] for r in gate["rules"] if r["result"] == "fail" and (kind is None or r["type"] == kind)]
