"""Grounding and wording check (Section 2.5.7): no invented figure or promise reaches the client.

1. Extract every number in the reply (sign, thousands commas, decimals, %),
   ignoring digits inside identifiers such as R-03, S3, T2 or SBF-01.
2. Allowed set: every number in this turn's tool results and in the user's
   message, the integers 0-10, and years 2000-2030.
3. A reply number x written with d decimals matches y when x is y rounded
   to d places (either direction at an exact half). This is stricter than
   the spec's |x - round(y, d)| <= 10^-d, which would let "10%" match 9;
   a percentage also matches y x 100.
4. Scan for banned phrases, case-insensitive.

Matched numbers become the reply's citations: the tool, the JSON path and
the value each figure came from.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.engines.numbers import round_half

# Identifiers carry digits that are labels, not quantities.
IDENTIFIER = re.compile(r"\b(?:[A-Z]{1,4}-\d+|[A-Z]{1,3}\d+[A-Z]?)\b|#\d+")
NUMBER = re.compile(r"(?<![\w.\-])([\-+−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%)?")
DIGITS = re.compile(r"\d+(?:\.\d+)?")

BANNED = [
    (r"\bguarantee", "guaranteed"),
    (r"\brisk[\s-]?free\b", "risk-free"),
    (r"\bno risk\b", "no risk"),
    (r"\bcan['’]?t lose\b", "can't lose"),
    (r"\bcannot lose\b", "cannot lose"),
    (r"\bsure profit", "sure profit"),
    (r"\bwill definitely\b", "will definitely"),
    (r"\bpromis", "promise"),
]


@dataclass(frozen=True)
class ReplyNumber:
    text: str
    value: float
    decimals: int
    percent: bool


@dataclass(frozen=True)
class Source:
    tool: str
    path: str
    value: float
    rank: int = 0  # 0 numeric field, 1 id-like field, 2 digits found inside text

    @property
    def citable(self) -> bool:
        return self.tool not in ("user_message", "context") and self.rank == 0


@dataclass
class GroundingResult:
    passed: bool
    unsupported: list[str] = field(default_factory=list)
    banned: list[str] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)

    def problem(self) -> str:
        parts = []
        if self.unsupported:
            parts.append("these numbers are not in any tool result: " + ", ".join(self.unsupported))
        if self.banned:
            parts.append("these phrases are not allowed: " + ", ".join(self.banned))
        return "; ".join(parts)


def extract_numbers(text: str) -> list[ReplyNumber]:
    cleaned = IDENTIFIER.sub(" ", text)
    found = []
    for m in NUMBER.finditer(cleaned):
        sign, whole, frac, pct = m.groups()
        raw = whole.replace(",", "") + (frac or "")
        value = float(raw)
        if sign in ("-", "−"):
            value = -value
        found.append(ReplyNumber(text=m.group(0).strip(), value=value, decimals=len(frac) - 1 if frac else 0, percent=bool(pct)))
    return found


def _is_id(path: str) -> bool:
    key = path.rsplit(".", 1)[-1].split("[", 1)[0]
    return key in ("id", "version", "parent_id") or key.endswith("_id")


def _walk(tool: str, value: Any, path: str, out: list[Source]) -> None:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        out.append(Source(tool, path, float(value), 1 if _is_id(path) else 0))
    elif isinstance(value, str):
        for d in DIGITS.findall(value):
            out.append(Source(tool, path, float(d), 2))
    elif isinstance(value, dict):
        for k, v in value.items():
            _walk(tool, v, f"{path}.{k}" if path else k, out)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _walk(tool, v, f"{path}[{i}]", out)


def allowed_sources(tool_results: list[tuple[str, Any]], user_message: str) -> list[Source]:
    sources: list[Source] = []
    for tool, result in tool_results:
        _walk(tool, result, "", sources)
    for n in extract_numbers(user_message):
        sources.append(Source("user_message", "message", abs(n.value)))
    return sorted(sources, key=lambda s: s.rank)  # stable: numeric fields first


def _matches(n: ReplyNumber, y: float) -> bool:
    """x is y rounded to x's decimals. Sign-insensitive: "a loss of CNY 12,000" states the size of -12000."""
    x = abs(n.value)
    half = 0.5 * 10**-n.decimals + 1e-9
    candidates = [abs(y)]
    if n.percent and abs(y) <= 1:
        candidates.append(abs(y) * 100)
    return any(abs(x - round_half(c, n.decimals)) <= 1e-9 or abs(x - c) <= half for c in candidates)


def check_reply(reply: str, tool_results: list[tuple[str, Any]], user_message: str) -> GroundingResult:
    sources = allowed_sources(tool_results, user_message)
    unsupported: list[str] = []
    citations: list[dict[str, Any]] = []
    cited: set[tuple[str, str]] = set()
    for n in extract_numbers(reply):
        x = abs(n.value)
        source = next((s for s in sources if _matches(n, s.value)), None)
        if source is not None:
            if source.citable and (source.tool, source.path) not in cited:
                cited.add((source.tool, source.path))
                citations.append({"tool": source.tool, "path": source.path, "value": source.value})
            continue
        if not n.percent and n.decimals == 0 and (x <= 10 or 2000 <= x <= 2030):
            continue
        unsupported.append(n.text)
    lowered = reply.lower()
    banned = [label for pattern, label in BANNED if re.search(pattern, lowered)]
    return GroundingResult(passed=not unsupported and not banned, unsupported=unsupported, banned=banned, citations=citations)


def result_text(result: Any) -> str:
    return json.dumps(result, ensure_ascii=False, sort_keys=True, default=str)
