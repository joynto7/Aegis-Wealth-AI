"""Risk scoring and tiers (Section 2.5.2; AT-03, AT-05)."""

from __future__ import annotations

import pytest

from app.engines.scoring import compute_tier, max_acceptable_loss, score_questionnaire, tier_from_score, validate_answers
from tests.conftest import AT03_ANSWERS
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_at03_scoring(catalog):
    s = score_questionnaire(AT03_ANSWERS, catalog.questionnaire["questions"])
    assert (s.capacity_score, s.willingness_score) == (70, 70)
    assert compute_tier(s.capacity_tier, s.willingness_tier, 0) == 4


@pytest.mark.parametrize("score,tier", [(0, 1), (20, 1), (25, 2), (40, 2), (45, 3), (60, 3), (65, 4), (80, 4), (85, 5), (100, 5)])
def test_tier_bands(score, tier):
    assert tier_from_score(score) == tier


def test_at05_replay_adjustment_lowers_once_and_never_below_one():
    assert compute_tier(4, 4, 1) == 3
    assert compute_tier(5, 2, 1) == 1
    assert compute_tier(1, 1, 1) == 1
    assert compute_tier(2, 5, 1) == 2  # capacity still caps the tier


def test_scores_are_multiples_of_five(catalog):
    qs = catalog.questionnaire["questions"]
    lowest = {q["id"]: min(q["options"], key=lambda o: o["points"])["id"] for q in qs}
    highest = {q["id"]: max(q["options"], key=lambda o: o["points"])["id"] for q in qs}
    lo, hi = score_questionnaire(lowest, qs), score_questionnaire(highest, qs)
    assert (lo.capacity_score, hi.willingness_score) == (5, 100)
    assert all(x % 5 == 0 for x in (lo.capacity_score, lo.willingness_score, hi.capacity_score, hi.willingness_score))


def test_answers_validated(catalog):
    qs = catalog.questionnaire["questions"]
    problems = validate_answers({**AT03_ANSWERS, "C1": "z", "Q9": "a"}, qs)
    assert {p["field"] for p in problems} == {"answers.C1", "answers.Q9"}
    assert validate_answers({"C1": "a"}, qs)  # nine missing


def test_max_acceptable_loss(catalog):
    assert [max_acceptable_loss({"W4": c}, catalog.max_loss_by_w4) for c in "abcd"] == [5, 10, 20, 30]
