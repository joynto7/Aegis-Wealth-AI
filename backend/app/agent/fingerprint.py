"""Configuration fingerprint (addition): one SHA-256 that names everything which shapes the advisor's answers.

It covers the model and its settings, the system prompt, the tool list, the
grounding policy and the versions of the data files the engines read (rules,
model portfolios, assumptions, scenarios, disclosures, regulations). Every chat
turn records it, every reply carries it, and the model disclosure states it, so
a filed disclosure (the CSRC's algorithm filing, Art. 23 of the 2018 Guiding
Opinions) can be matched to the replies that configuration produced. FINRA's
2026 report asks firms to track which model version was used and when.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.agent.llm import EFFORT, MAX_TOKENS
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import TOOL_DEFINITIONS, TOOL_TIERS
from app.services.context import AppContext

GROUNDING_POLICY = "grounding-2026-10: every number traced to a tool result or the client's message; banned phrases blocked"


def sha256(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def components(ctx: AppContext) -> dict[str, Any]:
    versions = dict(ctx.catalog.versions)
    return {
        "provider": "anthropic",
        "model": ctx.settings.model,
        "effort": EFFORT,
        "max_tokens": MAX_TOKENS,
        "system_prompt_sha256": sha256(SYSTEM_PROMPT),
        "tools_sha256": sha256(TOOL_DEFINITIONS),
        "tool_tiers": dict(sorted(TOOL_TIERS.items())),
        "grounding_policy": GROUNDING_POLICY,
        "data_versions": {k: versions[k] for k in sorted(versions)},
    }


def config_fingerprint(ctx: AppContext) -> str:
    return sha256(components(ctx))
