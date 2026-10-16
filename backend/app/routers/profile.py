"""Endpoints 4-9: questionnaire, profile, historical replay (Module 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.auth import client_user
from app.core.database import get_db
from app.core.errors import ApiError
from app.engines.replay import START_VALUE, run_replay
from app.models import User
from app.routers.common import ERRORS
from app.schemas import Profile, ProfileSubmit, Questionnaire, ReplayEpisodes, ReplayReactionRequest, ReplayResult
from app.services import profiles
from app.services.context import AppContext, get_ctx

router = APIRouter(tags=["profile"], responses=ERRORS)


@router.get("/profile/questionnaire", response_model=Questionnaire)
def questionnaire(_user: User = Depends(client_user), ctx: AppContext = Depends(get_ctx)) -> dict:
    return profiles.public_questionnaire(ctx)


@router.post("/profile", response_model=Profile, status_code=201)
def submit_profile(
    body: ProfileSubmit, user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    return profiles.to_schema(profiles.submit(db, ctx, user, body.answers), ctx)


@router.get("/profile/current", response_model=Profile)
def current_profile(user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    profile = profiles.latest(db, user.id)
    if profile is None:
        raise ApiError(404, "NOT_FOUND", "No risk profile yet.")
    return profiles.to_schema(profile, ctx)


@router.get("/replay/episodes", response_model=ReplayEpisodes)
def episodes(_user: User = Depends(client_user), ctx: AppContext = Depends(get_ctx)) -> dict:
    return {"episodes": [{"id": e.id, "name": e.name, "start": e.start, "end": e.end} for e in ctx.catalog.episodes]}


@router.get("/replay/{episode_id}", response_model=ReplayResult)
def replay(
    episode_id: str = Path(max_length=8),
    amount: float = Query(
        default=START_VALUE, ge=10_000, le=10_000_000, description="Addition: the starting value in CNY (default 100,000)."
    ),
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    profile = profiles.latest(db, user.id)
    if profile is None:
        raise ApiError(409, "PROFILE_REQUIRED", "Complete your risk profile first.")
    episode = ctx.catalog.episode(episode_id)
    if episode is None:
        raise ApiError(404, "NOT_FOUND", "There is no such episode.")
    return run_replay(
        episode,
        profile.tier,
        ctx.catalog.model_portfolios[profile.tier],
        ctx.catalog.history,
        data_label=ctx.catalog.history_label,
        data_as_of=ctx.catalog.history_as_of,
        start_value=amount,
        events_label=ctx.catalog.events_label,
    )


@router.post("/profile/current/replay-reaction", response_model=Profile)
def replay_reaction(
    body: ReplayReactionRequest,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return profiles.to_schema(profiles.react(db, ctx, user, body.episode_id, body.reaction), ctx)
