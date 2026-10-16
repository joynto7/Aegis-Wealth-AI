"""Additions: compliance controls, the Control Room overview, the regulatory map and the model disclosure.

GET /controls is open to every signed-in user, so a client's screen can say
when the advisor is paused; the reason stays with the compliance role. Every
other endpoint here is for the compliance role only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import compliance_user, current_user
from app.core.database import get_db
from app.models import User
from app.routers.common import ERRORS
from app.schemas import ControlChange, Controls, ModelCard, Oversight, Regulations
from app.services import controls, logs, oversight
from app.services.context import AppContext, get_ctx

router = APIRouter(tags=["compliance"], responses=ERRORS)


@router.get("/controls", response_model=Controls)
def get_controls(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return controls.snapshot(db, user)


@router.post("/compliance/controls", response_model=Controls)
def change_control(body: ControlChange, user: User = Depends(compliance_user), db: Session = Depends(get_db)) -> dict:
    """Suspend or resume the AI advisor, or halt or resume sandbox execution, with a reason (logged)."""
    return controls.set_state(db, user, body.control, body.state, body.reason)


@router.get("/compliance/overview", response_model=Oversight)
def get_overview(
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(compliance_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return oversight.overview(db, ctx, user, limit)


@router.get("/compliance/regulations", response_model=Regulations)
def get_regulations(_user: User = Depends(current_user), ctx: AppContext = Depends(get_ctx)) -> dict:
    return oversight.regulations(ctx)


@router.get("/compliance/model-card", response_model=ModelCard)
def get_model_card(
    user: User = Depends(compliance_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    """The model and allocation-logic disclosure (2018 Guiding Opinions, Art. 23). Each export is logged."""
    card = oversight.model_card(db, ctx, user)
    logs.add_now(
        db,
        user_id=user.id,
        actor="compliance",
        action="model_card_exported",
        decision="allowed",
        detail={"content_sha256": card["content_sha256"]},
    )
    return card
