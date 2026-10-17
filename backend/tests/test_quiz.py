"""Comprehension quiz (Section 2.5.9)."""

from __future__ import annotations

from app.engines.allocation import class_weights_of
from app.engines.metrics import compute_metrics
from app.engines.quiz import build_quiz, check_quiz
from app.engines.stress import compute_stress
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_quiz_rotates_and_checks(catalog):
    a = allocate(catalog)
    weights = class_weights_of(a.items)
    proposal = {
        "id": 7,
        "amount": 200_000,
        "stress": compute_stress(weights, 200_000, catalog.scenarios),
        "metrics": compute_metrics(a.items, weights, catalog.history, catalog.by_code),
    }
    questions = build_quiz(proposal)
    assert [q["id"] for q in questions] == ["Q1", "Q2", "Q3"]
    labels = [o["label"] for o in questions[0]["options"]]
    assert "CNY 25,900" in labels and labels[0] != "CNY 25,900"  # 7 mod 3 = 1: rotated
    right = {q: str((-7 % 3) + 1) for q in ("Q1", "Q2", "Q3")}
    assert check_quiz(proposal, right)["passed"]
    wrong = check_quiz(proposal, {**right, "Q3": "1" if right["Q3"] != "1" else "2"})
    assert not wrong["passed"]
    q3 = next(r for r in wrong["results"] if r["id"] == "Q3")
    assert q3["explanation"].startswith("Not quite:") and "CNY 80,000" in q3["explanation"]
