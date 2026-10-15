"""Contradiction rules X1-X3 (Section 2.5.2; AT-04)."""

from __future__ import annotations

from app.engines.contradictions import check_contradictions
from tests.conftest import AT03_ANSWERS, X2_ANSWERS
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_at04_contradiction_x2():
    assert [c["id"] for c in check_contradictions(X2_ANSWERS)] == ["X2"]


def test_contradictions_x1_and_x3():
    assert [c["id"] for c in check_contradictions({**AT03_ANSWERS, "C2": "a"})] == ["X1"]
    assert [c["id"] for c in check_contradictions({**AT03_ANSWERS, "W3": "a", "W1": "d", "W4": "a"})] == ["X3"]
    assert check_contradictions(AT03_ANSWERS) == []
