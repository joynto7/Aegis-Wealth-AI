"""Threat signals (addition): pattern rules that tag a client message with the attack it looks like.

Defence in depth only. The controls that stop an attack are the permission
broker, the gate and the grounding check; these signals make attempts visible,
so the compliance officer sees them in the review queue and the Control Room.
The message is still passed to the model as data, never as instructions.

Categories follow the OWASP Top 10 for Agentic Applications (2026) where they
fit: goal hijack (ASI01), tool misuse such as an execution request (ASI02),
identity and privilege abuse such as another client's data (ASI03), and human
trust exploitation such as pressure or a promised return (ASI09).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

SEVERITY_ORDER = {"low": 1, "medium": 2, "high": 3}


@dataclass(frozen=True)
class Pattern:
    id: str
    label: str
    severity: str
    owasp: str
    regex: re.Pattern[str]


PATTERNS: tuple[Pattern, ...] = (
    Pattern(
        "goal_hijack",
        "Instruction override",
        "high",
        "ASI01",
        re.compile(
            r"\b(ignore|disregard|forget|override|bypass|skip|disable[ds]?|suspend(ed)?)\b[^.?!\n]{0,40}"
            r"\b(rules?|instructions?|guidelines?|polic(y|ies)|limits?|gate|restrictions?|guardrails?|checks?|tiers?)\b"
            r"|\b(system override|admin mode|developer mode|new (policy|instructions?)|from now on you)\b"
            r"|<\s*/?\s*system\s*>|\bonly a suggestion\b|\bapprove all\b",
            re.I,
        ),
    ),
    Pattern(
        "prompt_extraction",
        "Prompt extraction",
        "medium",
        "ASI01",
        re.compile(
            r"\b(system|hidden|initial|original|secret)\s+(prompt|instructions?|message|rules)\b"
            r"|\b(print|reveal|show|repeat|output)\b[^.?!\n]{0,30}\b(prompt|instructions?)\b"
            r"|\bword for word\b",
            re.I,
        ),
    ),
    Pattern(
        "execution_request",
        "Execution request",
        "medium",
        "ASI02",
        re.compile(
            r"\b(execute|execut\w+|place (the |an |my )?orders?|order placed|confirm (it|and)|buy|sell)\b"
            r"[^.?!\n]{0,40}\b(now|immediately|right now|for me|on my behalf|today|all|everything|orders?|trade)\b"
            r"|\bexecute_\w+|\bconfirmation token\b|\bskip the (comprehension )?quiz\b|\bmark\b[^.?!\n]{0,40}\bexecuted\b",
            re.I,
        ),
    ),
    Pattern(
        "cross_client",
        "Another client's data",
        "high",
        "ASI03",
        re.compile(
            r"\b(another|other|different|every|all)\s+(client|user|customer|account)s?\b"
            r"|\buser\s*(id|#|no\.?)?\s*\d+\b|\b[\w.+-]+@[\w-]+\.\w+\b|\bsomeone else'?s?\b"
            r"|\b(chen|rina)'?s\b",
            re.I,
        ),
    ),
    Pattern(
        "tier_claim",
        "Unverified tier claim",
        "medium",
        "ASI09",
        re.compile(
            r"\b(i'?m|i am)\s+(actually |really )?(a )?tier\s*\d\b|\b(set|change)\s+my\s+tier\b|\bclient is tier\s*\d\b",
            re.I,
        ),
    ),
    Pattern(
        "role_play",
        "Role-play jailbreak",
        "medium",
        "ASI01",
        re.compile(r"\b(you are now|pretend( that| to be| you are)?|act as|role-?play|\bDAN\b|jailbreak|no rules)\b", re.I),
    ),
    Pattern(
        "authority_claim",
        "Claimed authority",
        "medium",
        "ASI09",
        re.compile(
            r"\b(as (your|the) (developer|admin|administrator|operator|creator)|i authori[sz]e you"
            r"|compliance (memo|says|team says)|my advisor'?s note|tool result:)\b",
            re.I,
        ),
    ),
    Pattern(
        "output_control",
        "Dictated reply",
        "medium",
        "ASI01",
        re.compile(r"\b(respond|reply|answer|say|output)\b[^.?!\n]{0,20}\bonly\b[^.?!\n]{0,20}['\"“‘]|\bnothing else\b", re.I),
    ),
    Pattern(
        "risk_waiver",
        "Waiver of suitability",
        "medium",
        "ASI09",
        re.compile(
            r"\bi accept all (the )?risks?\b|\bat my own risk\b|\bi take full responsibility\b"
            r"|\bwaive (the )?(rules?|suitability|warnings?|checks?)\b",
            re.I,
        ),
    ),
    Pattern(
        "concentration",
        "Large single weight",
        "low",
        "ASI09",
        re.compile(
            r"\b([5-9]\d|100)\s?%|\b(only|entirely|all in|all-in)\s+(in\s+)?(equit\w*|stocks?|thematic|high[- ]growth)", re.I
        ),
    ),
    Pattern(
        "pressure",
        "Pressure or urgency",
        "low",
        "ASI09",
        re.compile(r"\b(urgent(ly)?|immediately|right now|asap|or else|no time|before (it'?s|the market) )\b", re.I),
    ),
    Pattern(
        "return_promise",
        "Promised returns",
        "low",
        "ASI09",
        re.compile(r"\b(guarantee[ds]?|risk[- ]free|can'?t lose|cannot lose|sure profit|promise[ds]?)\b", re.I),
    ),
)

ENCODED = re.compile(r"[A-Za-z0-9+/]{40,}={0,2}")
INVISIBLE = {"Cf"}  # format characters: zero-width spaces, bidirectional overrides


def scan(message: str) -> list[dict[str, str]]:
    """The signals a message raises, most severe first; each names the matched text (up to 60 characters)."""
    signals = []
    for p in PATTERNS:
        match = p.regex.search(message)
        if match:
            signals.append(
                {"id": p.id, "label": p.label, "severity": p.severity, "owasp": p.owasp, "evidence": match.group(0)[:60]}
            )
    hidden = [ch for ch in message if unicodedata.category(ch) in INVISIBLE]
    encoded = ENCODED.search(message)
    if hidden or encoded:
        count = len(hidden)
        evidence = f"{count} invisible character{'s' if count != 1 else ''}" if hidden else encoded.group(0)[:60]
        signals.append(
            {"id": "obfuscation", "label": "Hidden or encoded text", "severity": "medium", "owasp": "ASI01", "evidence": evidence}
        )
    return sorted(signals, key=lambda s: -SEVERITY_ORDER[s["severity"]])


def highest(signals: list[dict[str, str]]) -> str | None:
    return signals[0]["severity"] if signals else None
