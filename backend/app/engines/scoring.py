"""Risk profiling (Section 2.5.2): capacity and willingness scored separately, tier is the lower one."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

GROUPS = ("capacity", "willingness")


@dataclass(frozen=True)
class ScoreResult:
    capacity_score: int
    willingness_score: int
    capacity_tier: int
    willingness_tier: int


def validate_answers(answers: Mapping[str, str], questions: tuple[Mapping[str, Any], ...]) -> list[dict[str, str]]:
    """Returns one {field, problem} per unanswered or invalid question; empty when all 10 are valid."""
    problems: list[dict[str, str]] = []
    known = {q["id"] for q in questions}
    for q in questions:
        chosen = answers.get(q["id"])
        if not chosen:
            problems.append({"field": f"answers.{q['id']}", "problem": "required"})
        elif chosen not in {o["id"] for o in q["options"]}:
            problems.append({"field": f"answers.{q['id']}", "problem": "not one of the options"})
    for qid in answers:
        if qid not in known:
            problems.append({"field": f"answers.{qid}", "problem": "unknown question"})
    return problems


def group_score(answers: Mapping[str, str], questions: tuple[Mapping[str, Any], ...], group: str) -> int:
    """Points out of 20, scaled to 100, so always a multiple of 5."""
    points = 0
    for q in questions:
        if q["group"] != group:
            continue
        option = next((o for o in q["options"] if o["id"] == answers.get(q["id"])), None)
        points += int(option["points"]) if option else 0
    return points * 5


def tier_from_score(score: int) -> int:
    if score <= 20:
        return 1
    if score <= 40:
        return 2
    if score <= 60:
        return 3
    if score <= 80:
        return 4
    return 5


def score_questionnaire(answers: Mapping[str, str], questions: tuple[Mapping[str, Any], ...]) -> ScoreResult:
    capacity = group_score(answers, questions, "capacity")
    willingness = group_score(answers, questions, "willingness")
    return ScoreResult(capacity, willingness, tier_from_score(capacity), tier_from_score(willingness))


def compute_tier(capacity_tier: int, willingness_tier: int, replay_adjustment: int) -> int:
    """T = min(T_cap, max(1, T_will - a_replay))."""
    return min(capacity_tier, max(1, willingness_tier - replay_adjustment))


def max_acceptable_loss(answers: Mapping[str, str], by_w4: Mapping[str, int]) -> int:
    """W4 sets the maximum acceptable loss used by R-08 and R-09: a=5, b=10, c=20, d=30."""
    return int(by_w4.get(answers.get("W4", "a"), 5))
