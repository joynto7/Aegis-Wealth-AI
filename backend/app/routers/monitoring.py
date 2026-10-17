"""Additions: the monitoring loop. The simulated market clock (compliance only), drift and rebalancing.

- The compliance officer reads and advances the market clock (1 to 12 months, with a reason, logged) and sees every
  client's drift. Clients cannot move the clock.
- A client reads the drift of their own portfolio and proposes a rebalancing: a new proposal version that the gate
  checks (T2 preconditions apply). Executing it still needs the quiz, the Confirm click and the one-time token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import client_user, compliance_user
from app.core.database import get_db
from app.models import User
from app.routers.common import ERRORS
from app.schemas import MarketAdvanceRequest, MarketState, MonitoringOverview, PortfolioMonitoring, Proposal
from app.services import logs, market, monitoring, profiles, proposals
from app.services.context import AppContext, get_ctx

router = APIRouter(responses=ERRORS, tags=["monitoring"])


@router.get("/compliance/market", response_model=MarketState)
def get_market(user: User = Depends(compliance_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    """The simulated market clock: its date, the history month it replayed last and the moves by asset class."""
    return market.state(db, ctx, user)


@router.post("/compliance/market/advance", response_model=MarketState)
def advance_market(
    body: MarketAdvanceRequest,
    user: User = Depends(compliance_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    """Move the simulated market 1 to 12 months forward, with a reason (logged as market_advanced). Nothing trades."""
    return market.advance(db, ctx, user, body.months, body.reason)


@router.get("/compliance/monitoring", response_model=MonitoringOverview)
def get_monitoring_overview(
    user: User = Depends(compliance_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    """Every client's drift from the mix they agreed to, rules their live holdings fail, and open rebalancings."""
    return monitoring.overview(db, ctx, user)


@router.get("/monitoring", response_model=PortfolioMonitoring)
def get_monitoring(user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    """The client's live portfolio against their latest executed proposal, and the trades a rebalancing would place."""
    return monitoring.client_view(db, ctx, user)


@router.post("/proposals/rebalance", response_model=Proposal, status_code=201)
def propose_rebalance(
    user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    """Propose a rebalancing back to the latest executed mix: a new version the gate checks. Nothing is executed.

    Returns the open rebalancing instead when one is already priced at today's prices.
    """
    profile = profiles.latest(db, user.id)
    problem = profiles.t2_error(profile, ctx)
    if problem is not None:
        logs.add_now(
            db,
            user_id=user.id,
            actor="client",
            action="rebalance_proposed",
            tier="T2",
            decision="denied",
            detail={"reason": problem.code},
        )
        raise problem
    return proposals.to_schema(monitoring.propose(db, ctx, user, profile), ctx)
