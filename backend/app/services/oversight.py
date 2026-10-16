"""Compliance oversight (addition): the Control Room's live view, the regulatory map and the model disclosure.

- overview: counts from the operation log (turns, tool calls by tier, broker
  denials, gate rejections of the agent's proposals, rewritten replies, orders
  by actor) and the latest agent turns, newest first.
- regulations: which requirement each AI control is designed to meet.
- model_card: the report Art. 23 of the 2018 Guiding Opinions asks firms to
  file: the model's main parameters and the allocation logic, with a SHA-256
  fingerprint of the system prompt and tool list so a filed report can be
  matched to the code that ran.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent.llm import EFFORT, MAX_TOKENS
from app.agent.orchestrator import HISTORY_MESSAGES, MAX_TOOL_ROUNDS
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import TOOL_DEFINITIONS, TOOL_TIERS
from app.core.timeutil import iso, utcnow
from app.engines.catalog import ASSET_CLASSES, thaw
from app.models import OperationLog, User
from app.schemas import ModelCard
from app.services import controls
from app.services.context import AppContext

ALLOCATION_STEPS = [
    "Start from the model portfolio for the client's tier (cash, bonds, gold, equities).",
    "Under a 3-year horizon, cap equities plus gold at 20%, equities first, and move the excess to bonds (cash for tier 1).",
    "Raise cash to cover the amount needed within 2 years (the liquidity floor), taking it pro rata from the other classes.",
    "Round each class to a whole percent, half away from zero; a remainder goes to cash, and an excess comes off the "
    "largest non-cash class.",
    "In each class, choose the lowest-fee eligible product, then the fastest to access: risk level at or below the tier, "
    "lock-up within the horizon, minimum investment within the slot, and only same- or next-day cash when money is needed soon.",
    "Split a class above 40% between its two lowest-fee eligible products, so no product exceeds 40%.",
    "If a class has no eligible product, move its weight to cash.",
]
PERMISSION_TIERS = [
    ("T0", "Read the product shelf and the compliance rules."),
    ("T1", "Read the client's own profile and proposals; the session's user id limits every query."),
    (
        "T2",
        "Create or revise a proposal; needs a complete, contradiction-free profile under 365 days old, and the gate always runs.",
    ),
    ("T3", "Execute orders. No tool exists: only the client's own Confirm click creates the single-use token."),
]
DATA_SENT = (
    "Each turn: the client's tier, capacity and willingness scores, maximum acceptable loss, profile status, current "
    "proposal number and status, the last 10 chat messages, and the results of the tools it calls."
)
DATA_NEVER_SENT = "Names, email addresses, passwords, session or confirmation tokens, and other clients' data."


def _sha256(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _turn(row: OperationLog) -> dict[str, Any]:
    d = row.detail or {}
    return {
        "log_id": row.id,
        "ts": iso(row.ts),
        "user_id": row.user_id,
        "mode": d.get("mode", "fallback"),
        "grounding": d.get("grounding", "fallback"),
        "tools": d.get("tools", []),
        "proposals": d.get("proposals", []),
        "figures_traced": int(d.get("figures_traced", 0)),
    }


def overview(db: Session, ctx: AppContext, viewer: User, limit: int) -> dict[str, Any]:
    grouped = db.execute(
        select(OperationLog.actor, OperationLog.action, OperationLog.tier, OperationLog.decision, func.count()).group_by(
            OperationLog.actor, OperationLog.action, OperationLog.tier, OperationLog.decision
        )
    ).all()
    counts: Counter[tuple[str, str, str | None, str | None]] = Counter()
    for actor, action, tier, decision, n in grouped:
        counts[(actor, action, tier, decision)] += n

    def total(**match: Any) -> int:
        keys = ("actor", "action", "tier", "decision")
        return sum(n for key, n in counts.items() if all(key[keys.index(k)] == v for k, v in match.items()))

    turns = db.scalars(select(OperationLog).where(OperationLog.action == "agent_turn").order_by(OperationLog.id.desc())).all()
    modes = Counter((t.detail or {}).get("mode") for t in turns)
    made = [p for t in turns for p in (t.detail or {}).get("proposals", [])]
    kpis = {
        "agent_turns": len(turns),
        "model_turns": modes["model"],
        "template_turns": modes["fallback"],
        "suspended_turns": modes["suspended"],
        "tool_calls_t0": total(actor="agent", action="tool_call", tier="T0"),
        "tool_calls_t1": total(actor="agent", action="tool_call", tier="T1"),
        "tool_calls_t2": total(actor="agent", action="tool_call", tier="T2"),
        "denied_tool_calls": total(actor="agent", action="permission_denied"),
        "agent_proposals": len(made),
        "agent_proposals_rejected": sum(1 for p in made if p.get("gate") == "REJECT"),
        "grounding_rewrites": total(action="grounding_regenerated"),
        "grounding_fallbacks": total(action="grounding_fallback"),
        "figures_traced": sum(int((t.detail or {}).get("figures_traced", 0)) for t in turns),
        "orders_by_agent": total(actor="agent", action="orders_executed", decision="allowed"),
        "orders_by_clients": total(actor="client", action="orders_executed", decision="allowed"),
    }
    return {
        "llm": "ok" if ctx.llm is not None else "fallback",
        "model": ctx.settings.model,
        "system_prompt_sha256": _sha256(SYSTEM_PROMPT),
        "controls": controls.snapshot(db, viewer),
        "kpis": kpis,
        "turns": [_turn(t) for t in turns[:limit]],
    }


def regulations(ctx: AppContext) -> dict[str, Any]:
    regs = thaw(ctx.catalog.regulations)
    frameworks = {f["id"]: f for f in regs["frameworks"]}
    return {
        "version": regs["version"],
        "note": regs["note"],
        "frameworks": regs["frameworks"],
        "ai_controls": [
            {
                **{k: c[k] for k in ("id", "ref", "requirement", "control", "check")},
                "framework": frameworks[c["framework"]]["short"],
                "title": frameworks[c["framework"]]["title"],
                "note": c.get("note"),
            }
            for c in regs["ai_controls"]
        ],
    }


def model_card(db: Session, ctx: AppContext, viewer: User) -> dict[str, Any]:
    catalog = ctx.catalog
    weights = lambda w: {c: float(w[c]) for c in ASSET_CLASSES}  # noqa: E731
    report: dict[str, Any] = {
        "report": "Aegis Wealth AI: AI model and asset-allocation logic disclosure",
        "generated_at": iso(utcnow()),
        "advisor": {
            "provider": "Anthropic",
            "model": ctx.settings.model,
            "mode": "model" if ctx.llm is not None else "fallback",
            "effort": EFFORT,
            "max_tokens": MAX_TOKENS,
            "timeout_seconds": ctx.settings.llm_timeout_seconds,
            "max_tool_rounds": MAX_TOOL_ROUNDS,
            "history_messages": HISTORY_MESSAGES,
            "system_prompt_sha256": _sha256(SYSTEM_PROMPT),
            "tools_sha256": _sha256(TOOL_DEFINITIONS),
            "data_sent": DATA_SENT,
            "data_never_sent": DATA_NEVER_SENT,
        },
        "tools": [{"name": t["name"], "tier": TOOL_TIERS[t["name"]], "description": t["description"]} for t in TOOL_DEFINITIONS],
        "permission_tiers": [{"tier": tier, "scope": scope} for tier, scope in PERMISSION_TIERS],
        "grounding": {
            "allowed_numbers": (
                "Every number in a reply must match a value in that turn's tool results or the client's message, rounded "
                "the same way; whole numbers up to 10 and years 2000-2030 need no source."
            ),
            "banned_phrases": list(catalog.banned_phrases),
            "on_failure": (
                "The reply is rewritten once with a note naming the problem; if it fails again, a checked template answers."
            ),
        },
        "allocation": {
            "tier_labels": {str(t): label for t, label in catalog.tier_labels.items()},
            "model_portfolios_pct": {str(t): weights(w) for t, w in catalog.model_portfolios.items()},
            "steps": ALLOCATION_STEPS,
            "assumed_gross_return_pct": {c: round(catalog.gross_return[c] * 100, 2) for c in ASSET_CLASSES},
            "stress_scenarios": [
                {"id": s.id, "name": s.name, "shocks_pct": {c: round(s.shocks[c] * 100, 2) for c in ASSET_CLASSES}}
                for s in catalog.scenarios
            ],
        },
        "rules": [thaw(r) for r in catalog.rules],
        "controls": controls.snapshot(db, viewer),
        "regulations": regulations(ctx),
        "data_versions": {
            **dict(catalog.versions),
            "products_as_of": catalog.products_as_of,
            "history": f"{catalog.history_label}, as of {catalog.history_as_of}",
        },
    }
    # Hash exactly what is served: the report as the response model writes it, without the hash itself.
    served = ModelCard.model_validate({**report, "content_sha256": ""}).model_dump(mode="json")
    del served["content_sha256"]
    return {**served, "content_sha256": _sha256(served)}
