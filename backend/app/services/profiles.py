"""Risk profiles: submission, versions, the historical-replay reaction, and the T2 preconditions."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.core.timeutil import iso, utcnow
from app.engines.contradictions import check_contradictions
from app.engines.scoring import compute_tier, max_acceptable_loss, score_questionnaire, validate_answers
from app.models import Profile, ReplayReaction, User
from app.services import logs
from app.services.context import AppContext


def latest(db: Session, user_id: int) -> Profile | None:
    return db.scalars(select(Profile).where(Profile.user_id == user_id).order_by(Profile.version.desc()).limit(1)).first()


def to_schema(profile: Profile, ctx: AppContext) -> dict[str, Any]:
    last = profile.reactions[-1] if profile.reactions else None
    return {
        "id": profile.id,
        "version": profile.version,
        "status": profile.status,
        "capacity_score": profile.capacity_score,
        "willingness_score": profile.willingness_score,
        "capacity_tier": profile.capacity_tier,
        "willingness_tier": profile.willingness_tier,
        "replay_adjustment": profile.replay_adjustment,
        "tier": profile.tier,
        "tier_label": ctx.catalog.tier_label(profile.tier),
        "max_acceptable_loss_pct": profile.max_acceptable_loss_pct,
        "contradictions": profile.contradictions,
        "replay": {"episode_id": last.episode_id, "reaction": last.reaction} if last else None,
        "created_at": iso(profile.created_at),
    }


def public_questionnaire(ctx: AppContext) -> dict[str, Any]:
    """The questionnaire without points (Section 2.6.4, endpoint 4)."""
    q = ctx.catalog.questionnaire
    return {
        "version": q["version"],
        "questions": [
            {
                "id": item["id"],
                "group": item["group"],
                "text": item["text"],
                "options": [{"id": o["id"], "label": o["label"]} for o in item["options"]],
            }
            for item in q["questions"]
        ],
    }


def submit(db: Session, ctx: AppContext, user: User, answers: dict[str, str]) -> Profile:
    questions = ctx.catalog.questionnaire["questions"]
    problems = validate_answers(answers, questions)
    if problems:
        raise validation_error("Please answer every question with one of its options.", problems)
    scored = score_questionnaire(answers, questions)
    contradictions = check_contradictions(answers)
    previous = latest(db, user.id)
    profile = Profile(
        user_id=user.id,
        version=(previous.version if previous else 0) + 1,
        answers=dict(answers),
        capacity_score=scored.capacity_score,
        willingness_score=scored.willingness_score,
        capacity_tier=scored.capacity_tier,
        willingness_tier=scored.willingness_tier,
        replay_adjustment=0,
        tier=compute_tier(scored.capacity_tier, scored.willingness_tier, 0),
        max_acceptable_loss_pct=max_acceptable_loss(answers, ctx.catalog.max_loss_by_w4),
        contradictions=contradictions,
        status="needs_review" if contradictions else "complete",
    )
    db.add(profile)
    db.flush()
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="profile_submitted",
        decision="allowed",
        detail={"profile_id": profile.id, "version": profile.version, "status": profile.status, "tier": profile.tier},
    )
    db.commit()
    return profile


def react(db: Session, ctx: AppContext, user: User, episode_id: str, reaction: str) -> Profile:
    """Stores one reaction per episode; only the first "sell everything" lowers willingness by one (FR-2.4)."""
    profile = latest(db, user.id)
    if profile is None:
        raise ApiError(409, "PROFILE_REQUIRED", "Complete your risk profile first.")
    if profile.status != "complete":
        raise ApiError(409, "CONTRADICTIONS_OPEN", "Fix the contradictions in your risk profile before the replay.")
    if ctx.catalog.episode(episode_id) is None:
        raise validation_error("Choose one of the three episodes.", [{"field": "episode_id", "problem": "unknown episode"}])
    before = profile.tier
    profile.reactions.append(ReplayReaction(episode_id=episode_id, reaction=reaction))
    if reaction == "sell_all" and profile.replay_adjustment < 1:
        profile.replay_adjustment = 1
        profile.tier = compute_tier(profile.capacity_tier, profile.willingness_tier, 1)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "STATE_CONFLICT", "You already answered this episode. Retake the profile to answer again.") from None
    logs.add(
        db,
        user_id=user.id,
        actor="client",
        action="replay_reaction",
        decision="allowed",
        detail={"episode_id": episode_id, "reaction": reaction, "tier_before": before, "tier_after": profile.tier},
    )
    db.commit()
    db.refresh(profile)
    return profile


def t2_error(profile: Profile | None, ctx: AppContext) -> ApiError | None:
    """T2 preconditions (Section 2.8.1): a complete profile with no contradiction, under 365 days old."""
    max_age = timedelta(days=int(ctx.catalog.thresholds["profile_max_age_days"]))
    if profile is None or utcnow() - profile.created_at > max_age:
        return ApiError(409, "PROFILE_REQUIRED", "You need a current risk profile first.")
    if profile.contradictions:
        return ApiError(
            409,
            "CONTRADICTIONS_OPEN",
            "Your risk profile has an answer that contradicts another. Fix it before requesting a proposal.",
            {"contradiction_ids": [c["id"] for c in profile.contradictions]},
        )
    return None
