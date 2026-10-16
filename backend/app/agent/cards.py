"""Chat cards (addition): the tool results behind a reply, shown as structured cards beside the text.

The broker's own outcomes become the cards, never the model's words, so a card
needs no grounding check: it is the tool result itself, cut down to what the
client needs to see. A denied call becomes a "blocked" card, so the client sees
the permission broker at work in the conversation.
"""

from __future__ import annotations

from typing import Any

from app.agent.broker import ToolOutcome
from app.engines.catalog import Catalog

MAX_CARDS = 4
MAX_PRODUCTS = 6


def _proposal_card(result: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    names = {r["id"]: r["name"] for r in catalog.rules}
    gate = result["gate"]
    return {
        "type": "proposal",
        "proposal_id": result["id"],
        "version": result["version"],
        "status": result["status"],
        "amount": result["amount"],
        "horizon_years": result["horizon_years"],
        "tier": result["tier"],
        "class_weights_pct": result["class_weights_pct"],
        "gate_decision": gate["decision"],
        "failed_rules": [
            {"id": r["id"], "name": names.get(r["id"], r["id"]), "type": r["type"], "detail": r["detail"]}
            for r in gate["rules"]
            if r["result"] == "fail"
        ],
        "data_label": result["data_label"],
    }


def card_for(outcome: ToolOutcome, catalog: Catalog) -> dict[str, Any] | None:
    if outcome.decision == "denied":
        reason = outcome.detail.get("reason") or (outcome.error or "").removeprefix("PERMISSION_DENIED: ")
        return {"type": "blocked", "tool": outcome.tool, "tier": outcome.tier, "reason": reason}
    result = outcome.result
    if result is None:
        return None
    if outcome.tool == "search_products":
        items = result["items"]
        return {
            "type": "products",
            "items": [
                {k: i[k] for k in ("code", "name", "type", "risk_level", "annual_fee_pct", "suitable")}
                for i in items[:MAX_PRODUCTS]
            ],
            "total": len(items),
            "data_label": result["data_label"],
        }
    if outcome.tool == "compare_products":
        return {
            "type": "comparison",
            **{k: result[k] for k in ("amount", "horizon_years", "items", "cheapest_code", "data_label")},
        }
    if outcome.tool == "explain_rule":
        return {
            "type": "rule",
            "id": result["id"],
            "rule_type": result["type"],
            **{k: result[k] for k in ("name", "description", "threshold")},
            "basis": [dict(b) for b in result.get("basis", ())],
        }
    if outcome.tool == "get_profile_summary":
        if not result.get("has_profile"):
            return None
        return {
            "type": "profile",
            **{
                k: result[k]
                for k in ("tier", "tier_label", "capacity_score", "willingness_score", "max_acceptable_loss_pct", "status")
            },
        }
    if outcome.tool in ("get_proposal", "create_proposal", "revise_proposal"):
        return _proposal_card(result, catalog)
    return None


def _key(card: dict[str, Any]) -> tuple[Any, ...]:
    kind = card["type"]
    if kind == "proposal":
        return (kind, card["proposal_id"])
    if kind == "comparison":
        return (kind, tuple(i["code"] for i in card["items"]))
    if kind == "rule":
        return (kind, card["id"])
    if kind == "blocked":
        return (kind, card["tool"], card["reason"])
    return (kind,)


def cards_for(outcomes: list[ToolOutcome], catalog: Catalog) -> list[dict[str, Any]]:
    """One card per distinct result, in the order the tools ran; a repeat replaces the earlier card."""
    by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    for outcome in outcomes:
        card = card_for(outcome, catalog)
        if card is None:
            continue
        key = _key(card)
        by_key.pop(key, None)
        by_key[key] = card
    return list(by_key.values())[-MAX_CARDS:]
