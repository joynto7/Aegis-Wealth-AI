"""The permission broker (Section 2.8.1): the only way the agent reaches data or changes anything.

T0 read the shelf and rules - any valid session.
T1 read the client's own data - the session's user id is passed into every
   query, and the service layer checks ownership again.
T2 create or revise proposals - only with a complete, contradiction-free
   profile under 365 days old; the gate runs inside the proposal service.
T3 execute - no tool exists. Only the client's click can create the token.

While compliance has the advisor suspended, every call is denied (addition).
Every call is logged with its tier and decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agent.tools import RUNNERS, TOOL_TIERS, ToolContext, ToolInputError
from app.core.errors import ApiError
from app.services import controls, logs, profiles


@dataclass
class ToolOutcome:
    tool: str
    tier: str
    decision: str  # allowed | denied
    summary: str
    result: dict[str, Any] | None = None
    error: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)

    @property
    def is_error(self) -> bool:
        return self.error is not None

    def for_model(self) -> str:
        import json

        if self.error:
            return self.error
        return json.dumps(self.result, ensure_ascii=False, default=str)

    def public(self) -> dict[str, Any]:
        """The chip shown in the chat: tool, tier, decision and a one-line summary (FR-6.1)."""
        return {
            "tool": self.tool,
            "tier": self.tier if self.tier in ("T0", "T1", "T2") else "T2",
            "decision": self.decision,
            "summary": self.summary,
        }


def _summary(tool: str, args: dict[str, Any], result: dict[str, Any] | None) -> str:
    if tool == "search_products":
        n = len((result or {}).get("items", []))
        return f"Searched the shelf ({n} products)"
    if tool == "compare_products":
        return "Compared " + ", ".join(args.get("product_codes", []))
    if tool == "explain_rule":
        return f"Explained {args.get('rule_id')}"
    if tool == "get_profile_summary":
        return "Loaded your profile summary"
    if tool == "get_proposal":
        return f"Loaded proposal #{args.get('proposal_id')}"
    if tool == "create_proposal" and result:
        return f"Created proposal #{result['id']}: gate {result['gate']['decision']}"
    if tool == "revise_proposal" and result:
        return f"Saved version {result['version']} as #{result['id']}: gate {result['gate']['decision']}"
    return tool


class PermissionBroker:
    def __init__(self, tc: ToolContext):
        self.tc = tc
        self.outcomes: list[ToolOutcome] = []

    def _record(self, outcome: ToolOutcome) -> ToolOutcome:
        action = "tool_call" if outcome.decision == "allowed" else "permission_denied"
        detail = {"summary": outcome.summary, **outcome.detail}
        if outcome.error:
            detail["error"] = outcome.error
        logs.add_now(
            self.tc.db,
            user_id=self.tc.user.id,
            actor="agent",
            action=action,
            tool=outcome.tool,
            tier=outcome.tier,
            decision=outcome.decision,
            detail=detail,
        )
        self.outcomes.append(outcome)
        return outcome

    def _deny(self, tool: str, tier: str, reason: str, summary: str) -> ToolOutcome:
        return self._record(
            ToolOutcome(tool, tier, "denied", summary, error=f"PERMISSION_DENIED: {reason}", detail={"reason": reason})
        )

    def run(self, tool: str, args: dict[str, Any]) -> ToolOutcome:
        tier = TOOL_TIERS.get(tool)
        if tier is None:
            # Includes any attempt at an execution tool: none exists at any tier.
            return self._deny(tool, "T3", "no such tool; orders are placed only by the client's Confirm click", f"Blocked {tool}")
        if self.tc.user.role != "client":
            return self._deny(tool, tier, "the agent serves clients only", f"Blocked {tool}")
        if controls.advisor_suspended(self.tc.db):
            return self._deny(tool, tier, "the AI advisor is suspended by compliance", f"Blocked {tool}: advisor suspended")
        if tier == "T2":
            problem = profiles.t2_error(self.tc.profile, self.tc.ctx)
            if problem is not None:
                return self._deny(tool, tier, f"requires T2 ({problem.code})", f"Blocked {tool}: {problem.code}")
        try:
            result = RUNNERS[tool](self.tc, args)
        except ToolInputError as exc:
            return self._record(ToolOutcome(tool, tier, "allowed", f"Rejected input for {tool}", error=f"INVALID_INPUT: {exc}"))
        except ApiError as exc:
            if exc.status == 403:
                return self._deny(tool, tier, f"{tier} covers only the client's own data", f"Blocked {tool}: not your data")
            return self._record(
                ToolOutcome(tool, tier, "allowed", f"{tool} failed: {exc.code}", error=f"{exc.code}: {exc.message}")
            )
        except (KeyError, TypeError, ValueError) as exc:
            return self._record(ToolOutcome(tool, tier, "allowed", f"Rejected input for {tool}", error=f"INVALID_INPUT: {exc}"))
        detail = {}
        if result and "id" in result and tool in ("create_proposal", "revise_proposal", "get_proposal"):
            detail["proposal_id"] = result["id"]
        return self._record(ToolOutcome(tool, tier, "allowed", _summary(tool, args, result), result=result, detail=detail))
