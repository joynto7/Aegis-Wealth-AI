"""The three contradiction rules (Section 2.5.2). An open contradiction blocks proposals (409 CONTRADICTIONS_OPEN)."""

from __future__ import annotations

from collections.abc import Mapping


def check_contradictions(answers: Mapping[str, str]) -> list[dict[str, object]]:
    high_growth = answers.get("W3") == "d" or answers.get("W5") == "d"
    found: list[dict[str, object]] = []
    if high_growth and answers.get("C2") == "a":
        found.append(
            {
                "id": "X1",
                "message": "You chose high growth but need the money within a year.",
                "question_ids": ["W3", "W5", "C2"],
            }
        )
    if answers.get("W4") == "a" and high_growth:
        found.append(
            {
                "id": "X2",
                "message": "You want maximum growth but can accept at most a 5% loss.",
                "question_ids": ["W4", "W3", "W5"],
            }
        )
    if answers.get("W1") == "d" and answers.get("W4") == "a":
        found.append(
            {
                "id": "X3",
                "message": "You would buy more after a 20% fall, but can accept at most a 5% loss.",
                "question_ids": ["W1", "W4"],
            }
        )
    return found
