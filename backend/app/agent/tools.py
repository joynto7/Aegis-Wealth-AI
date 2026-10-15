"""The agent's seven tools (Section 2.5.6), tiers T0-T2. There is no T3 (execution) tool.

Schemas are strict (`strict: true`, `additionalProperties: false`, every
property required; optional inputs are nullable). Strict mode does not carry
numeric or length limits, so the broker validates ranges before running.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.engines.fees import compare_products
from app.models import Profile, User
from app.services import profiles, proposals
from app.services.context import AppContext

PRODUCT_TYPES = [
    "deposit",
    "money_market_fund",
    "short_term_bond_fund",
    "bond_fund",
    "gold_etf",
    "index_etf",
    "active_equity_fund",
    "thematic_equity_fund",
]
RULE_IDS = [f"R-0{i}" for i in range(1, 10)]


def _schema(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "search_products",
        "description": (
            "Search the shelf of 20 sample products. Returns code, name, type, risk level (1-5), annual fee %, "
            "liquidity days, lock-up months and whether each suits the client's tier. All filters are optional (null)."
        ),
        "strict": True,
        "input_schema": _schema(
            {
                "type": _nullable({"type": "string", "enum": PRODUCT_TYPES}),
                "max_risk": _nullable({"type": "integer", "enum": [1, 2, 3, 4, 5]}),
                "query": _nullable({"type": "string"}),
            }
        ),
    },
    {
        "name": "compare_products",
        "description": (
            "Compare 2 or 3 products for an amount (CNY 10,000-10,000,000) and a horizon (1-30 whole years): fee cost, "
            "end value after fees under an assumed gross return, liquidity, lock-up and suitability. Assumed returns are "
            "illustrations, not forecasts."
        ),
        "strict": True,
        "input_schema": _schema(
            {
                "product_codes": {"type": "array", "items": {"type": "string"}},
                "amount": {"type": "number"},
                "horizon_years": {"type": "integer"},
            }
        ),
    },
    {
        "name": "explain_rule",
        "description": "Return the text and threshold of one compliance-gate rule, R-01 to R-09.",
        "strict": True,
        "input_schema": _schema({"rule_id": {"type": "string", "enum": RULE_IDS}}),
    },
    {
        "name": "get_profile_summary",
        "description": (
            "Return the client's own risk profile: tier, capacity and willingness scores, open contradictions and "
            "maximum acceptable loss."
        ),
        "strict": True,
        "input_schema": _schema({}),
    },
    {
        "name": "get_proposal",
        "description": (
            "Return one of the client's own proposals: items with the reason each was chosen, risk metrics, the three "
            "hypothetical stress results and the compliance-gate result with every rule."
        ),
        "strict": True,
        "input_schema": _schema({"proposal_id": {"type": "integer"}}),
    },
    {
        "name": "create_proposal",
        "description": (
            "Create a new proposal from an amount (CNY), a horizon in whole years and the amount needed within 2 years. "
            "The compliance gate always runs; nothing is executed. Requires a complete, current risk profile."
        ),
        "strict": True,
        "input_schema": _schema(
            {"amount": {"type": "number"}, "horizon_years": {"type": "integer"}, "near_term_need": {"type": "number"}}
        ),
    },
    {
        "name": "revise_proposal",
        "description": (
            "Save a new version of one of the client's open proposals with new product weights (they must total 100). "
            "The compliance gate always runs on the new version; nothing is executed."
        ),
        "strict": True,
        "input_schema": _schema(
            {
                "proposal_id": {"type": "integer"},
                "items": {
                    "type": "array",
                    "items": _schema({"product_code": {"type": "string"}, "weight_pct": {"type": "number"}}),
                },
            }
        ),
    },
]

TOOL_TIERS: dict[str, str] = {
    "search_products": "T0",
    "compare_products": "T0",
    "explain_rule": "T0",
    "get_profile_summary": "T1",
    "get_proposal": "T1",
    "create_proposal": "T2",
    "revise_proposal": "T2",
}


class ToolInputError(Exception):
    """The input passed the schema but not the server-side limits (INVALID_INPUT)."""


@dataclass
class ToolContext:
    db: Session
    ctx: AppContext
    user: User

    @property
    def profile(self) -> Profile | None:
        return profiles.latest(self.db, self.user.id)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ToolInputError(message)


def proposal_view(doc: dict[str, Any]) -> dict[str, Any]:
    """What the model sees of a proposal: the decision-relevant parts, no ids of other users."""
    return {
        "id": doc["id"],
        "version": doc["version"],
        "status": doc["status"],
        "tier": doc["tier"],
        "amount": doc["amount"],
        "horizon_years": doc["horizon_years"],
        "near_term_need": doc["near_term_need"],
        "items": doc["items"],
        "class_weights_pct": doc["class_weights_pct"],
        "metrics": doc["metrics"],
        "stress": doc["stress"],
        "gate": doc["gate"],
        "quiz_passed": doc["quiz_passed"],
        "notes": doc["notes"],
        "data_label": doc["data_label"],
    }


def _suitable(tc: ToolContext, risk_level: int) -> bool | None:
    profile = tc.profile
    return None if profile is None else risk_level <= profile.tier


def search_products(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    query = (args.get("query") or "").strip().lower()
    _require(len(query) <= 100, "query must be at most 100 characters")
    items = []
    for p in tc.ctx.catalog.products:
        if args.get("type") and p.type != args["type"]:
            continue
        if args.get("max_risk") and p.risk_level > int(args["max_risk"]):
            continue
        if query and query not in p.name.lower() and query not in p.code.lower():
            continue
        items.append(
            {
                "code": p.code,
                "name": p.name,
                "type": p.type,
                "risk_level": p.risk_level,
                "annual_fee_pct": p.annual_fee_pct,
                "liquidity_days": p.liquidity_days,
                "lockup_months": p.lockup_months,
                "suitable": _suitable(tc, p.risk_level),
            }
        )
    return {"items": items, "data_label": "Sample data"}


def compare(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    codes = list(args["product_codes"])
    _require(2 <= len(codes) <= 3 and len(set(codes)) == len(codes), "compare 2 or 3 different product codes")
    _require(10_000 <= float(args["amount"]) <= 10_000_000, "amount must be CNY 10,000 to 10,000,000")
    _require(1 <= int(args["horizon_years"]) <= 30, "horizon_years must be 1 to 30")
    products = [tc.ctx.catalog.product(c) for c in codes]
    unknown = [c for c, p in zip(codes, products, strict=True) if p is None]
    _require(not unknown, f"unknown product codes: {', '.join(unknown)}")
    result = compare_products(products, float(args["amount"]), int(args["horizon_years"]), tc.ctx.catalog.gross_return)
    for item in result["items"]:
        item["suitable"] = _suitable(tc, item["risk_level"])
    return result


def explain_rule(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    rule = next((r for r in tc.ctx.catalog.rules if r["id"] == args["rule_id"]), None)
    _require(rule is not None, "unknown rule id")
    return dict(rule)


def get_profile_summary(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    profile = tc.profile
    if profile is None:
        return {"has_profile": False}
    return {
        "has_profile": True,
        "tier": profile.tier,
        "tier_label": tc.ctx.catalog.tier_label(profile.tier),
        "capacity_score": profile.capacity_score,
        "willingness_score": profile.willingness_score,
        "replay_adjustment": profile.replay_adjustment,
        "max_acceptable_loss_pct": profile.max_acceptable_loss_pct,
        "status": profile.status,
        "contradictions": profile.contradictions,
    }


def get_proposal(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    proposal = proposals.get_owned(tc.db, tc.user, int(args["proposal_id"]))
    return proposal_view(proposals.to_schema(proposal, tc.ctx))


def create_proposal(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    amount, horizon, need = float(args["amount"]), int(args["horizon_years"]), float(args["near_term_need"])
    _require(10_000 <= amount <= 10_000_000, "amount must be CNY 10,000 to 10,000,000")
    _require(1 <= horizon <= 30, "horizon_years must be 1 to 30")
    _require(0 <= need <= amount, "near_term_need must be between 0 and the amount")
    proposal = proposals.create(
        tc.db, tc.ctx, tc.user, tc.profile, amount=amount, horizon_years=horizon, near_term_need=need, actor="agent"
    )
    return proposal_view(proposals.to_schema(proposal, tc.ctx))


def revise_proposal(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    items = list(args["items"])
    _require(1 <= len(items) <= 6, "use 1 to 6 items")
    _require(all(0 <= float(i["weight_pct"]) <= 100 for i in items), "each weight must be 0 to 100")
    _require(len({i["product_code"] for i in items}) == len(items), "each product may appear once")
    parent = proposals.get_owned(tc.db, tc.user, int(args["proposal_id"]))
    proposal = proposals.revise(tc.db, tc.ctx, tc.user, parent, tc.profile, items, actor="agent")
    return proposal_view(proposals.to_schema(proposal, tc.ctx))


RUNNERS: dict[str, Callable[[ToolContext, dict[str, Any]], dict[str, Any]]] = {
    "search_products": search_products,
    "compare_products": compare,
    "explain_rule": explain_rule,
    "get_profile_summary": get_profile_summary,
    "get_proposal": get_proposal,
    "create_proposal": create_proposal,
    "revise_proposal": revise_proposal,
}

__all__ = ["RUNNERS", "TOOL_DEFINITIONS", "TOOL_TIERS", "ApiError", "ToolContext", "ToolInputError", "proposal_view"]
