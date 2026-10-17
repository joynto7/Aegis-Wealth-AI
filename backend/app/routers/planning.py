"""Additions: goal projections, the saved goal, the dashboard briefing and live-portfolio analytics.

All client-only and read-only except the saved goal, which is logged. Every
figure comes from the engines; none is written by the language model.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import client_user
from app.core.database import get_db
from app.models import User
from app.routers.common import ERRORS
from app.schemas import GoalEnvelope, GoalInput, Insights, PortfolioAnalytics, Projection, ProjectionRequest
from app.services import planning
from app.services.context import AppContext, get_ctx

router = APIRouter(responses=ERRORS, tags=["planning"])


@router.post("/projections", response_model=Projection)
def projection(
    body: ProjectionRequest, user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    """A seeded Monte Carlo projection of a proposal, the live portfolio or a tier's mix (illustrative, not a forecast)."""
    return planning.projection(db, ctx, user, body.model_dump())


@router.get("/goals/current", response_model=GoalEnvelope)
def get_goal(user: User = Depends(client_user), db: Session = Depends(get_db)) -> dict:
    return {"goal": planning.goal_schema(planning.current_goal(db, user))}


@router.put("/goals/current", response_model=GoalEnvelope)
def put_goal(body: GoalInput, user: User = Depends(client_user), db: Session = Depends(get_db)) -> dict:
    return {"goal": planning.goal_schema(planning.set_goal(db, user, body.model_dump()))}


@router.get("/insights", response_model=Insights)
def insights(user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    """The dashboard briefing: insights computed by code from the client's own data."""
    return planning.insights(db, ctx, user)


@router.get("/sandbox/analytics", response_model=PortfolioAnalytics, tags=["sandbox"])
def analytics(user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    """Weights, fees and hypothetical stress of what the client holds now."""
    return planning.analytics(db, ctx, user)
