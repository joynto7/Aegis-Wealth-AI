"""Compliance controls (addition): stop the AI advisor or halt sandbox execution by hand.

The 2018 Guiding Opinions (Art. 23) expect a firm to step in by hand and
adjust or stop its AI business when the model goes wrong. Two switches do that:

- advisor: active | suspended. While suspended, no chat turn runs and the
  permission broker refuses every tool call, so a turn already under way stops
  at its next tool.
- execution: open | halted. While halted, no confirmation token is issued and
  no order is placed, even with a token issued earlier.

Only the compliance role can flip a switch, always with a reason, and every
change goes to the operation log. Clients see the state, not the reason.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.timeutil import iso, utcnow
from app.models import Control, User
from app.services import logs

STATES: dict[str, tuple[str, str]] = {"advisor": ("active", "suspended"), "execution": ("open", "halted")}
ACTIONS = {
    ("advisor", "suspended"): "advisor_suspended",
    ("advisor", "active"): "advisor_resumed",
    ("execution", "halted"): "execution_halted",
    ("execution", "open"): "execution_resumed",
}


def state(db: Session, control: str) -> str:
    row = db.get(Control, control)
    return row.state if row else STATES[control][0]


def advisor_suspended(db: Session) -> bool:
    return state(db, "advisor") == "suspended"


def execution_halted(db: Session) -> bool:
    return state(db, "execution") == "halted"


def snapshot(db: Session, viewer: User) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for control, (default, _) in STATES.items():
        row = db.get(Control, control)
        entry: dict[str, Any] = {
            "state": row.state if row else default,
            "changed_at": iso(row.updated_at) if row else None,
            "reason": None,
            "changed_by": None,
        }
        if viewer.role == "compliance" and row is not None:
            changer = db.get(User, row.updated_by)
            entry.update(reason=row.reason, changed_by=changer.display_name if changer else None)
        out[control] = entry
    return out


def set_state(db: Session, user: User, control: str, new_state: str, reason: str) -> dict[str, Any]:
    if new_state not in STATES[control]:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            f"The {control} switch is either {' or '.join(STATES[control])}.",
            {"fields": [{"field": "state", "problem": "not a state of this control"}]},
        )
    if state(db, control) == new_state:
        return snapshot(db, user)  # already there: nothing to change or log
    row = db.get(Control, control) or Control(id=control)
    row.state, row.reason, row.updated_by, row.updated_at = new_state, reason, user.id, utcnow()
    db.add(row)
    logs.add(
        db,
        user_id=user.id,
        actor="compliance",
        action=ACTIONS[(control, new_state)],
        decision="allowed",
        detail={"control": control, "state": new_state, "reason": reason},
    )
    db.commit()
    return snapshot(db, user)
