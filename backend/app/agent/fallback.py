"""Fallback answers (Section 2.5.8): when the model is unavailable or a reply fails twice.

A keyword match picks an intent; its tools run through the same permission
broker as the model's would, and the template is filled only from their
results - so every fallback answer is grounded by construction.

Beyond the five spec intents, the templates also answer attack patterns from
the red-team groups (Section 2.8.4) on their own terms: execution requests and
prompt extraction are declined, requests for other clients' data go through
the broker (which denies them), and rule-breaking changes are attempted as a
revision so the gate can reject them in the open (Scenario 4).
"""

from __future__ import annotations

import re
from typing import Any

from app.agent.broker import PermissionBroker
from app.agent.grounding import GroundingResult, check_reply
from app.engines.numbers import format_money

# Ordered: the first matching pattern decides.
PROMPT_EXTRACTION = re.compile(r"system prompt|hidden instruction|your instructions|reveal (your|the) prompt|print your")
EXECUTION = re.compile(
    r"execut|place (the |an |my )?orders?|order placed|buy (the|it|now|them|this)|confirm and|confirm it|"
    r"confirmation token|skip the (comprehension )?quiz|mark .{0,40}executed|right now"
)
OVERRIDE = re.compile(
    r"put (everything|all)|everything in|all[- ]in|all of my (cash|money)|100% of my|move 100%|100% into|"
    r"ignore (your|all|the|previous) (rules|instructions)"
)
CREATE = re.compile(r"(create|build|make)( me)? an? (new )?(proposal|portfolio)")
OTHER_CLIENT = re.compile(
    r"\bchen\b|\brina\b|\buser \d|every client|all clients|other client|another client|[\w.+-]+@[\w-]+\.\w+"
)
PROPOSAL_REF = re.compile(r"proposal\s*(?:#|no\.?|number)?\s*(\d+)")
TIER_CLAIM = re.compile(r"(i'?m|i am) (actually |really )?(a )?tier|set my tier|change my tier|\bis tier \d|tier \d,")
RULES = re.compile(
    r"skip the (compliance )?gate|bypass|override|suspend|disabled|no rules|\bdan\b|only a suggestion|"
    r"forget (all )?(previous|prior|your)|ignore (rules|your|all|the)|admin mode|approve all"
)
PRODUCT_CODE = re.compile(r"\b([a-z]{3}-\d{2})\b")
PERCENT = re.compile(r"(\d{1,3})\s?%")
THEMATIC = re.compile(r"thematic|high[- ]growth")

PRODUCT_WORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"bond"), "bond"),
    (re.compile(r"gold"), "gold"),
    (re.compile(r"index|etf|equit|stock|share"), "equity"),
    (re.compile(r"deposit|money market|cash"), "cash"),
]
INTENTS: list[tuple[str, re.Pattern[str]]] = [
    ("explain_rejection", re.compile(r"reject|failed|rule|why not|warning")),
    ("compare", re.compile(r"compare|cheaper|cheapest|fee|cost")),
    ("explain_tier", re.compile(r"tier|risk level|profile|score")),
    ("explain_proposal", re.compile(r"why|explain|portfolio|allocation|proposal|fund")),
    ("next_step", re.compile(r"next|how do i|confirm|what now|what should")),
]

OTHER = "I can't answer that right now. I can explain your proposal, your risk tier, product fees or a gate result."
NO_PROPOSAL = "You don't have a proposal yet. Next step: open Proposals and enter an amount and a horizon."

NEXT_STEP = {
    "rejected": "revise the proposal so every hard rule passes",
    "warning": "tick each warning on the Confirm screen, then take the quiz",
    "acknowledged": "open Confirm and Execute and take the three-question quiz",
    "passed": "open Confirm and Execute and take the three-question quiz",
    "executed": "check your sandbox account and the advice record",
    "superseded": "open the latest version of this proposal",
}


def detect_intent(message: str) -> str:
    m = message.lower()
    if PROMPT_EXTRACTION.search(m):
        return "prompt_extraction"
    if EXECUTION.search(m):
        return "execution_request"
    if PROPOSAL_REF.search(m) and not CREATE.search(m):
        return "proposal_by_id"
    if OTHER_CLIENT.search(m):
        return "other_client"
    if TIER_CLAIM.search(m):
        return "tier_claim"
    if OVERRIDE.search(m):
        return "override_attempt"
    if (PRODUCT_CODE.search(m) or THEMATIC.search(m)) and PERCENT.search(m):
        return "revise_request"
    if CREATE.search(m):
        return "create_request"
    if RULES.search(m):
        return "rules_refusal"
    if PRODUCT_CODE.search(m) or (
        re.search(r"why|explain|what is|tell me about", m) and re.search(r"fund|product|deposit|etf|this one", m)
    ):
        return "explain_item"
    for name, pattern in INTENTS:
        if pattern.search(m):
            return name
    return "other"


def _current_proposal_id(broker: PermissionBroker, proposal_id: int | None) -> int | None:
    from app.services import proposals

    if proposal_id is not None:
        return proposal_id
    latest = proposals.latest_open(broker.tc.db, broker.tc.user)
    return latest.id if latest else None


def _proposal(broker: PermissionBroker, proposal_id: int | None) -> dict[str, Any] | None:
    pid = _current_proposal_id(broker, proposal_id)
    if pid is None:
        return None
    return broker.run("get_proposal", {"proposal_id": pid}).result


def _next(p: dict[str, Any]) -> str:
    return NEXT_STEP.get(p["status"], "review the proposal")


def _explain_proposal(p: dict[str, Any]) -> str:
    w = p["class_weights_pct"]
    worst = min(p["stress"], key=lambda s: s["loss_pct"])
    return (
        f"Your proposal holds {w['cash']:g}% cash, {w['bond']:g}% bonds, {w['equity']:g}% equities and {w['gold']:g}% gold, "
        f"suited to tier {p['tier']}. Its worst hypothetical loss is {format_money(abs(worst['loss_cny']))} in {worst['name']}. "
        f"Next step: {_next(p)}."
    )


def _gate_outcome(broker: PermissionBroker, result: dict[str, Any] | None) -> str:
    if result is None:
        return "I couldn't make that change. I have no tool that places orders; to act, review the proposal and press Confirm."
    gate = result["gate"]
    failed = [r for r in gate["rules"] if r["result"] == "fail" and r["type"] == "hard"]
    if gate["decision"] == "REJECT" and failed:
        names = {r["id"]: r["name"] for r in broker.tc.ctx.catalog.rules}
        listed = " and ".join(f"{r['id']} ({names.get(r['id'], r['id'])})" for r in failed)
        return (
            f"I can't do that. The gate rejected that version: {listed}. No order was placed. "
            "To act on any change, review the proposal yourself and press Confirm."
        )
    return (
        f"That version got a {gate['decision']} from the gate, but I still can't place an order: "
        "only your own click on Confirm can do that."
    )


def _revise_to(broker: PermissionBroker, p: dict[str, Any], code: str, weight: int) -> str:
    """Tries the requested weight as a new version; the gate, not the agent, decides."""
    weight = max(0, min(100, weight))
    others = [i for i in p["items"] if i["product_code"] != code]
    rest = sum(i["weight_pct"] for i in others) or 1
    scaled = [int(i["weight_pct"] / rest * (100 - weight)) for i in others]
    if scaled:
        scaled[0] += 100 - weight - sum(scaled)
    items = [{"product_code": code, "weight_pct": weight}] + [
        {"product_code": i["product_code"], "weight_pct": w} for i, w in zip(others, scaled, strict=True) if w > 0
    ]
    return _gate_outcome(broker, broker.run("revise_proposal", {"proposal_id": p["id"], "items": items}).result)


def _target_product(broker: PermissionBroker, m: str) -> str | None:
    code = PRODUCT_CODE.search(m)
    if code and broker.tc.ctx.catalog.product(code.group(1).upper()):
        return code.group(1).upper()
    if THEMATIC.search(m) or re.search(r"equit|stock", m):
        thematic = sorted(
            (x for x in broker.tc.ctx.catalog.products if x.asset_class == "equity" and x.risk_level == 5),
            key=lambda x: x.annual_fee_pct,
        )
        return thematic[0].code
    return None


def _explain_item(p: dict[str, Any], message: str) -> str | None:
    """Answers "why this product?" from the engine's own reason for choosing it."""
    m = message.lower()
    item = next((i for i in p["items"] if i["product_code"].lower() in m), None)
    if item is None:
        cls = next((c for pattern, c in PRODUCT_WORDS if pattern.search(m)), None)
        item = next((i for i in p["items"] if i["asset_class"] == cls), None) if cls else None
    if item is None:
        return None
    return (
        f"{item['name']} ({item['product_code']}) is {item['weight_pct']:g}% of your proposal, "
        f"{format_money(item['amount'])}. {item['rationale']} Next step: {_next(p)}."
    )


def _parse_amount_and_years(m: str) -> tuple[float | None, int | None]:
    amount = re.search(r"cny\s?([\d,]+(?:\.\d+)?)", m) or re.search(r"([\d,]{5,})", m)
    years = re.search(r"(\d{1,2})\s*(?:years?|yrs?)", m)
    return (
        float(amount.group(1).replace(",", "")) if amount else None,
        int(years.group(1)) if years else None,
    )


def answer(broker: PermissionBroker, message: str, proposal_id: int | None) -> str:
    m = message.lower()
    intent = detect_intent(message)

    if intent == "prompt_extraction":
        return f"I can't share my internal instructions. {OTHER.split('. ', 1)[1]}"

    if intent == "execution_request":
        p = _proposal(broker, proposal_id)
        tail = f" Your proposal is {p['status']}. Next step: {_next(p)}." if p else ""
        return (
            "I can't place orders, issue a confirmation token or skip the quiz: I have no tool that can. "
            f"Only your own click on Confirm and Execute places orders, after the quiz.{tail}"
        )

    if intent == "proposal_by_id":
        pid = int(PROPOSAL_REF.search(m).group(1))
        outcome = broker.run("get_proposal", {"proposal_id": pid})
        if outcome.result is None:
            return "I can only open your own proposals, so I can't show that one. I can explain any of yours."
        return _explain_proposal(outcome.result)

    if intent == "other_client":
        return (
            "I can only see your own profile, proposals and records; I can't open or describe another client's data. "
            "I can explain your proposal, your risk tier or product fees."
        )

    if intent == "tier_claim":
        s = broker.run("get_profile_summary", {}).result or {}
        if not s.get("has_profile"):
            return "Your tier comes only from the risk questionnaire. Next step: answer the 10 questions in Risk Profile."
        return (
            f"I can't change your tier: it comes from your own answers (capacity {s['capacity_score']}, willingness "
            f"{s['willingness_score']}) and the replay, so it is {s['tier']} ({s['tier_label']}). "
            "To change it, retake the risk profile."
        )

    if intent in ("override_attempt", "revise_request"):
        p = _proposal(broker, proposal_id)
        if p is None or p["status"] in ("executed", "superseded"):
            return (
                "I can't place or change any order myself: I have no tool that can. Generate a current proposal first, "
                "then review it and press Confirm for any real change."
            )
        target = _target_product(broker, m) or _target_product(broker, "high-growth")
        pct = PERCENT.search(m)
        # Scenario 4: "everything" is attempted as the largest single position the client asked for.
        weight = int(pct.group(1)) if pct and intent == "revise_request" else (100 if "100%" in m else 60)
        return _revise_to(broker, p, target, weight)

    if intent == "create_request":
        amount, years = _parse_amount_and_years(m)
        if amount is None or years is None:
            return "Tell me an amount in CNY and a horizon in years, and I'll build a proposal for your tier."
        outcome = broker.run("create_proposal", {"amount": amount, "horizon_years": years, "near_term_need": 0})
        if outcome.result is None:
            return f"I couldn't build that proposal ({(outcome.error or '').split(':')[0]}). Check your risk profile and cash."
        p = outcome.result
        return (
            f"I built proposal #{p['id']} for {format_money(p['amount'])} over {p['horizon_years']} years. The engine "
            f"chose the mix for tier {p['tier']}, not the one asked for: {_explain_proposal(p)}"
        )

    if intent == "rules_refusal":
        rule = broker.run("explain_rule", {"rule_id": "R-02"}).result or {}
        return (
            "I can't change, skip or switch off the compliance rules: they run in code on every proposal, for me "
            f"and for you. {rule.get('name', 'Suitability')} ({rule.get('id', 'R-02')}): {rule.get('description', '')}"
        ).strip()

    if intent == "explain_item":
        p = _proposal(broker, proposal_id)
        if p is None:
            return NO_PROPOSAL
        return _explain_item(p, message) or _explain_proposal(p)

    if intent == "explain_tier":
        s = broker.run("get_profile_summary", {}).result or {}
        if not s.get("has_profile"):
            return "You don't have a risk profile yet. Next step: answer the 10 questions in Risk Profile."
        return (
            f"Your capacity score is {s['capacity_score']} and your willingness score is {s['willingness_score']}; "
            f"your tier is the lower one, {s['tier']} ({s['tier_label']})."
        )

    if intent == "compare":
        p = _proposal(broker, proposal_id)
        codes = [i["product_code"] for i in p["items"]][:3] if p else ["SBF-01", "SBF-02"]
        if len(codes) < 2:
            return "I need at least two products to compare. Next step: select two or three on the Product Shelf."
        amount = p["amount"] if p else 100_000
        horizon = p["horizon_years"] if p else 5
        r = broker.run("compare_products", {"product_codes": codes, "amount": amount, "horizon_years": horizon}).result
        if not r:
            return OTHER
        a, b = r["items"][0], r["items"][1]
        # Products in different asset classes use different assumed returns; say so instead of quoting one.
        growth = (
            f"{a['assumed_return_pct']:g}% a year"
            if a["assumed_return_pct"] == b["assumed_return_pct"]
            else f"{a['assumed_return_pct']:g}% and {b['assumed_return_pct']:g}% a year respectively"
        )
        cheapest = next((i["name"] for i in r["items"] if i["code"] == r["cheapest_code"]), a["name"])
        return (
            f"Over {r['horizon_years']} years on {format_money(r['amount'])}, fees would cost about "
            f"{format_money(a['fee_cost'])} for {a['name']} and {format_money(b['fee_cost'])} for {b['name']}, "
            f"assuming growth of {growth} before fees. {cheapest} costs the least in fees."
        )

    if intent in ("explain_rejection", "explain_proposal", "next_step"):
        p = _proposal(broker, proposal_id)
        if p is None:
            return NO_PROPOSAL
        if intent == "explain_proposal":
            return _explain_proposal(p)
        if intent == "next_step":
            return f"Your proposal is {p['status']}. Next step: {_next(p)}."
        hard = next((r for r in p["gate"]["rules"] if r["result"] == "fail" and r["type"] == "hard"), None)
        if hard:
            return f"The gate rejected this version: {hard['id']}, {hard['message']} Change that item and the gate runs again."
        soft = next((r for r in p["gate"]["rules"] if r["result"] == "fail"), None)
        if soft:
            return (
                f"The gate did not reject this version, but it raised a warning: {soft['id']}, {soft['message']} "
                "Tick each warning on the Confirm screen to continue."
            )
        return f"This version passed every rule. Its status is {p['status']}."
    return OTHER


def grounding_for(broker: PermissionBroker, reply: str, message: str) -> GroundingResult:
    """The template's citations and number sources: the same check a model reply gets."""
    results = [(o.tool, o.result) for o in broker.outcomes if o.result is not None]
    return check_reply(reply, results, message)
