"""How to fix (addition): the smallest set of changes that gets a proposal through the gate.

A counterfactual explanation of the gate's decision, computed by code. The
repairs run in a fixed order, each the way the allocation engine itself would
do it, and the whole gate then runs again on the result:

1. R-02 and R-06: a product above the tier, or locked beyond the horizon, is
   swapped for the lowest-fee eligible product of the same class (bonds, then
   cash, when the class has none).
2. R-01: the weights are brought back to 100: a shortfall goes to cash, an
   excess is trimmed from illiquid products first (again at the end).
3. R-05: under 3 years, equity and gold above 20% move to bonds, equity first.
4. R-03: a non-cash product above 40% sends its excess to the next eligible
   product of its class, then to bonds, then to cash.
5. R-04: cash that can be withdrawn within a day is raised to cover the
   near-term need, one point at a time.
6. R-07 (soft): the most expensive products are swapped for cheaper ones of
   the same class until the weighted fee is within the limit.
7. R-08 and R-09 (soft): 5 points at a time move from equity (then gold) to
   bonds until the historical drawdown and the worst stress loss are within
   the client's limit.

Eligible means what step 5 of the allocation engine allows: risk level at or
below the tier, lock-up within the horizon, minimum investment within the
slot, and only liquid cash when money is needed soon. Weight is taken first
from products the fix itself added, then from the most expensive. Every change
records the rule it serves. Applying the fix is an ordinary revision, so the
gate runs again and the version history keeps it.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from fractions import Fraction
from typing import Any

from app.engines.allocation import class_weights_of
from app.engines.catalog import MonthlyReturn, ProductSpec, Scenario
from app.engines.gate import evaluate_gate, failed_rule_ids
from app.engines.metrics import compute_metrics
from app.engines.numbers import round2
from app.engines.stress import compute_stress, worst_scenario

STEP_PCT = 5
MAX_LOSS_STEPS = 20
EPS = 1e-9


class _Work:
    """The allocation being repaired: weights by product code, in a stable order, with a log of why each moved."""

    def __init__(self, items: Sequence[Mapping[str, Any]], by_code: Mapping[str, ProductSpec]):
        self.by_code = by_code
        self.weights: dict[str, float] = {}
        for item in items:
            self.weights[item["product_code"]] = self.weights.get(item["product_code"], 0.0) + float(item["weight_pct"])
        self.original = dict(self.weights)
        self.reasons: dict[str, list[str]] = {}
        self.rules: dict[str, list[str]] = {}

    def note(self, code: str, rule_id: str, reason: str) -> None:
        if reason not in self.reasons.setdefault(code, []):
            self.reasons[code].append(reason)
        if rule_id not in self.rules.setdefault(code, []):
            self.rules[code].append(rule_id)

    def move(self, src: str, dst: str, pts: float, rule_id: str, why_src: str, why_dst: str) -> None:
        if pts <= EPS or src == dst:
            return
        self.weights[src] = self.weights.get(src, 0.0) - pts
        self.weights[dst] = self.weights.get(dst, 0.0) + pts
        self.note(src, rule_id, why_src)
        self.note(dst, rule_id, why_dst)

    def held(self) -> list[str]:
        return [c for c, w in self.weights.items() if w > EPS]

    def of_class(self, asset_class: str) -> list[str]:
        return [c for c in self.held() if self.by_code[c].asset_class == asset_class]

    def total(self) -> float:
        return sum(w for w in self.weights.values() if w > EPS)

    def donor(self, codes: Sequence[str]) -> str:
        """Which holding gives up weight first: one the fix added, then the costliest, then the largest."""
        return min(codes, key=lambda c: (c in self.original, -self.by_code[c].annual_fee_pct, -self.weights[c], c))


def suggest_fix(
    items: Sequence[Mapping[str, Any]],
    *,
    tier: int,
    amount: float,
    horizon_years: int,
    near_term_need: float,
    max_acceptable_loss_pct: float,
    products: Sequence[ProductSpec],
    by_code: Mapping[str, ProductSpec],
    history: tuple[MonthlyReturn, ...],
    scenarios: tuple[Scenario, ...],
    thresholds: Mapping[str, float],
) -> dict[str, Any]:
    max_single = float(thresholds["max_single_product_pct"])
    short_years = int(thresholds["short_horizon_years"])
    short_cap = float(thresholds["short_horizon_equity_gold_cap_pct"])
    max_fee = float(thresholds["max_weighted_fee_pct"])
    horizon_months = horizon_years * 12
    work = _Work(items, by_code)

    def eligible(asset_class: str, slot_pct: float = 0.0) -> list[ProductSpec]:
        slot = slot_pct / 100 * amount
        found = [
            p
            for p in products
            if p.asset_class == asset_class
            and p.risk_level <= tier
            and p.lockup_months <= horizon_months
            and p.min_investment <= max(slot, 0.0)
            and (asset_class != "cash" or near_term_need <= 0 or p.liquid)
        ]
        return sorted(found, key=lambda p: (p.annual_fee_pct, p.liquidity_days, p.code))

    def room(code: str) -> float:
        if by_code[code].asset_class == "cash":
            return math.inf
        return max(0.0, max_single - work.weights.get(code, 0.0))

    def place(pts: float, classes: Sequence[str], rule_id: str, why_src: str, src: str, exclude: set[str]) -> float:
        """Send pts from src to eligible products of the given classes, each up to the 40% limit; returns what is left."""
        left = pts
        for asset_class in classes:
            for p in eligible(asset_class, left):
                if left <= EPS:
                    return 0.0
                if p.code in exclude or p.code == src:
                    continue
                take = min(left, room(p.code))
                if take <= EPS:
                    continue
                why_dst = f"Takes the weight moved here: {p.annual_fee_pct:.2f}% a year, risk level R{p.risk_level}."
                work.move(src, p.code, take, rule_id, why_src, why_dst)
                left -= take
        return left

    safe_classes = ("cash",) if tier == 1 else ("bond", "cash")

    # R-01: weights total 100, through cash. Run before the other repairs, so they work on the whole amount,
    # and again at the end. A trim takes from holdings that can't be withdrawn within a day first.
    def rebalance_total() -> None:
        gap = 100 - work.total()
        if gap > EPS:
            cash = eligible("cash", gap)
            if cash:
                dst = cash[0].code
                work.weights[dst] = work.weights.get(dst, 0.0) + gap
                work.note(dst, "R-01", "Takes the missing weight so the total is 100%.")
        while gap < -EPS:
            held = work.held()
            donors = [c for c in held if not by_code[c].liquid] or [c for c in held if by_code[c].asset_class != "cash"] or held
            src = work.donor(donors)
            take = min(-gap, work.weights[src])
            work.weights[src] -= take
            work.note(src, "R-01", "Trimmed so the total is 100%.")
            gap += take

    # 1. R-02 and R-06: swap unsuitable and locked products.
    for code in list(work.held()):
        p = by_code[code]
        problems = []
        if p.risk_level > tier:
            problems.append(("R-02", f"Risk level R{p.risk_level} is above your tier {tier}."))
        if p.lockup_months > horizon_months:
            problems.append(("R-06", f"Locks money for {p.lockup_months} months, beyond your {horizon_months}-month horizon."))
        for rule_id, why in problems:
            pts = work.weights.get(code, 0.0)
            if pts <= EPS:
                continue
            classes = (p.asset_class, *[c for c in safe_classes if c != p.asset_class])
            place(pts, classes, rule_id, f"{why} Swapped out.", code, exclude=set())

    # 2. R-01.
    rebalance_total()

    # 3. R-05: under the short horizon, cap equity plus gold.
    if horizon_years < short_years:
        risky = [c for c in work.held() if by_code[c].asset_class in ("equity", "gold")]
        excess = sum(work.weights[c] for c in risky) - short_cap
        order = sorted(risky, key=lambda c: (by_code[c].asset_class != "equity", -work.weights[c], c))
        for code in order:
            if excess <= EPS:
                break
            take = min(excess, work.weights[code])
            why = f"Equity and gold may be at most {short_cap:g}% with under {short_years} years."
            left = place(take, safe_classes, "R-05", why, code, exclude=set())
            excess -= take - left

    # 4. R-03: no non-cash product above 40%.
    for code in list(work.held()):
        p = by_code[code]
        excess = work.weights.get(code, 0.0) - max_single
        if p.asset_class == "cash" or excess <= EPS:
            continue
        why = f"Capped at the {max_single:g}% limit for one product."
        classes = (p.asset_class, *[c for c in safe_classes if c != p.asset_class])
        place(excess, classes, "R-03", why, code, exclude=set())

    # 5. R-04: liquid cash covers the near-term need.
    if near_term_need > 0 and amount > 0:
        need_pct = math.ceil(Fraction(near_term_need) * 100 / Fraction(amount))
        liquid = sum(work.weights[c] for c in work.held() if by_code[c].liquid)
        shortfall = need_pct - liquid
        cash = eligible("cash", float(need_pct))
        if shortfall > EPS and cash:
            dst = cash[0]
            while shortfall > EPS:
                donors = [c for c in work.held() if not by_code[c].liquid]
                if not donors:
                    break
                src = work.donor(donors)
                take = min(1.0, shortfall, work.weights[src])
                work.move(
                    src,
                    dst.code,
                    take,
                    "R-04",
                    "Trimmed to fund cash you can withdraw within 1 day.",
                    f"Raised to cover your near-term need ({dst.liquidity_days}-day access).",
                )
                shortfall -= take

    def measure() -> tuple[dict[str, float], list[dict[str, Any]]]:
        current = _items(work, by_code, amount)
        weights = class_weights_of(current)
        return compute_metrics(current, weights, history, by_code), compute_stress(weights, amount, scenarios)

    # 6. R-07 (soft): swap the most expensive products while the fee is over the limit.
    metrics, stress = measure()
    for code in sorted(work.held(), key=lambda c: (-by_code[c].annual_fee_pct, c)):
        if metrics["weighted_fee_pct"] <= max_fee:
            break
        p = by_code[code]
        cheaper = [q for q in eligible(p.asset_class, work.weights[code]) if q.annual_fee_pct < p.annual_fee_pct]
        if not cheaper:
            continue
        why = f"Charges {p.annual_fee_pct:.2f}% a year; the weighted fee is over {max_fee:.2f}%."
        place(work.weights[code], (p.asset_class,), "R-07", why, code, exclude={p.code})
        metrics, stress = measure()

    # 7. R-08 and R-09 (soft): move risk to bonds until the losses fit the client's limit.
    limit = float(max_acceptable_loss_pct)
    for _ in range(MAX_LOSS_STEPS):
        mdd = float(metrics["max_drawdown_pct"])
        worst = abs(float(worst_scenario(stress)["loss_pct"]))
        if mdd <= limit and worst <= limit:
            break
        donors = work.of_class("equity") or work.of_class("gold")
        if not donors:
            break
        src = work.donor(donors)
        take = min(float(STEP_PCT), work.weights[src])
        rule_id = "R-08" if mdd > limit else "R-09"
        why = f"Lowered so the largest fall fits the {limit:g}% you said you could accept."
        left = place(take, safe_classes, rule_id, why, src, exclude=set())
        if left >= take - EPS:
            break
        metrics, stress = measure()

    rebalance_total()
    after_items = _items(work, by_code, amount)
    weights = class_weights_of(after_items)
    metrics = compute_metrics(after_items, weights, history, by_code)
    stress = compute_stress(weights, amount, scenarios)
    common = dict(
        tier=tier,
        amount=amount,
        horizon_years=horizon_years,
        near_term_need=near_term_need,
        max_acceptable_loss_pct=max_acceptable_loss_pct,
        by_code=by_code,
        thresholds=thresholds,
    )
    before_items = [dict(i) for i in items]
    before_weights = class_weights_of(before_items)
    before_gate = evaluate_gate(
        items=before_items,
        class_weights_pct=before_weights,
        metrics=compute_metrics(before_items, before_weights, history, by_code),
        stress=compute_stress(before_weights, amount, scenarios),
        **common,
    )
    after_gate = evaluate_gate(items=after_items, class_weights_pct=weights, metrics=metrics, stress=stress, **common)

    changes = []
    for code in [*work.original, *[c for c in work.weights if c not in work.original]]:
        before = round2(work.original.get(code, 0.0))
        after = round2(max(work.weights.get(code, 0.0), 0.0))
        if before == after:
            continue
        p = by_code[code]
        changes.append(
            {
                "product_code": code,
                "name": p.name,
                "asset_class": p.asset_class,
                "risk_level": p.risk_level,
                "from_pct": before,
                "to_pct": after,
                "rule_ids": sorted(work.rules.get(code, [])),
                "reasons": work.reasons.get(code, []),
            }
        )
    fixed = [r for r in failed_rule_ids(before_gate) if r not in failed_rule_ids(after_gate)]
    return {
        "gate_before": before_gate["decision"],
        "failed_before": failed_rule_ids(before_gate),
        "gate_after": after_gate["decision"],
        "failed_after": failed_rule_ids(after_gate),
        "fixed_rule_ids": fixed,
        "changes": changes,
        "items": [{"product_code": i["product_code"], "weight_pct": i["weight_pct"]} for i in after_items],
        "metrics_after": metrics,
        "summary": _summary(changes, before_gate["decision"], after_gate["decision"], fixed),
    }


def _items(work: _Work, by_code: Mapping[str, ProductSpec], amount: float) -> list[dict[str, Any]]:
    out = []
    for code in work.held():
        p = by_code[code]
        w = round2(work.weights[code])
        if w <= 0:
            continue
        out.append(
            {
                "product_code": code,
                "name": p.name,
                "asset_class": p.asset_class,
                "risk_level": p.risk_level,
                "weight_pct": w,
                "amount": round2(w / 100 * amount),
                "rationale": "",
            }
        )
    return out


def _summary(changes: list[dict[str, Any]], before: str, after: str, fixed: list[str]) -> str:
    if not changes:
        return "Nothing to change: every rule this fix can address already passes."
    added = sum(max(0.0, c["to_pct"] - c["from_pct"]) for c in changes)
    removed = sum(max(0.0, c["from_pct"] - c["to_pct"]) for c in changes)
    moved = round2(max(added, removed))
    rules = ", ".join(fixed) if fixed else "no rule"
    return (
        f"Moving {moved:g} points across {len(changes)} products fixes {rules}; the gate's verdict goes from {before} to {after}."
    )
