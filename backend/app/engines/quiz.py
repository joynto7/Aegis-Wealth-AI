"""Comprehension quiz (Section 2.5.9): three questions built from the proposal; all three must be right.

Option order rotates by proposal_id mod 3, so it is deterministic but the
right answer is not always first. A failed attempt explains why each chosen
wrong answer is wrong.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.engines.numbers import format_money
from app.engines.stress import worst_scenario

QUESTION_TEXT = {
    "Q1": "What is the largest hypothetical loss in the stress tests?",
    "Q2": "Which statement is true?",
    "Q3": "How much can you withdraw within 1 day?",
}


def _canonical(proposal: Mapping[str, Any]) -> dict[str, list[dict[str, Any]]]:
    worst = worst_scenario(proposal["stress"])
    worst_loss = abs(float(worst["loss_cny"]))
    liquid_pct = float(proposal["metrics"]["liquid_share_pct"])
    withdrawable = liquid_pct / 100 * float(proposal["amount"])
    return {
        "Q1": [
            {
                "label": format_money(worst_loss),
                "correct": True,
                "why": f"{format_money(worst_loss)} is the worst loss across the three stress scenarios ({worst['name']}).",
            },
            {
                "label": "CNY 0, losses are not possible",
                "correct": False,
                "why": "Losses are possible: every stress scenario shows this mix losing value.",
            },
            {
                "label": format_money(worst_loss / 2),
                "correct": False,
                "why": "That is only half of the worst stress-scenario loss.",
            },
        ],
        "Q2": [
            {
                "label": "The value can go down as well as up.",
                "correct": True,
                "why": "Investments can fall as well as rise; nothing here is guaranteed.",
            },
            {
                "label": "Returns are fixed in advance.",
                "correct": False,
                "why": "No return is fixed: the figures shown are history or hypothetical scenarios, not promises.",
            },
            {
                "label": "The sandbox cannot lose value.",
                "correct": False,
                "why": "Sandbox positions are valued at NAV, so they can lose value like real ones.",
            },
        ],
        "Q3": [
            {
                "label": format_money(withdrawable),
                "correct": True,
                "why": f"Only the liquid share ({liquid_pct:g}% of the amount) can be withdrawn within 1 day.",
            },
            {
                "label": format_money(float(proposal["amount"])),
                "correct": False,
                "why": "Not all of it: some products take more than 1 day to sell or are locked up.",
            },
            {
                "label": "CNY 0",
                "correct": False,
                "why": f"The liquid share ({liquid_pct:g}% of the amount) can be withdrawn within 1 day.",
            },
        ],
    }


def _options(proposal: Mapping[str, Any]) -> dict[str, list[dict[str, Any]]]:
    shift = int(proposal["id"]) % 3
    built = {}
    for qid, options in _canonical(proposal).items():
        rotated = options[shift:] + options[:shift]
        built[qid] = [{"id": str(i + 1), **opt} for i, opt in enumerate(rotated)]
    return built


def build_quiz(proposal: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {"id": qid, "text": QUESTION_TEXT[qid], "options": [{"id": o["id"], "label": o["label"]} for o in opts]}
        for qid, opts in _options(proposal).items()
    ]


def check_quiz(proposal: Mapping[str, Any], answers: Mapping[str, str]) -> dict[str, Any]:
    results = []
    for qid, opts in _options(proposal).items():
        chosen = next((o for o in opts if o["id"] == answers.get(qid)), None)
        right = next(o for o in opts if o["correct"])
        correct = bool(chosen and chosen["correct"])
        if correct:
            explanation = "Correct."
        else:
            lead = f"Not quite: {chosen['why']} " if chosen else "No answer chosen. "
            explanation = f"{lead}The right answer is {right['label']}: {right['why']}"
        results.append({"id": qid, "correct": correct, "explanation": explanation})
    return {"passed": all(r["correct"] for r in results), "results": results}
