"""Endpoints 13-21: proposals, revision, warnings, quiz, confirm and execute (Modules 4, 5, 7)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Path
from sqlalchemy.orm import Session

from app.core.auth import client_user
from app.core.database import get_db
from app.core.errors import ApiError
from app.models import User
from app.routers.common import ERRORS
from app.schemas import (
    AcknowledgeRequest,
    ConfirmTokenResponse,
    ExecuteResponse,
    Proposal,
    ProposalCreate,
    ProposalList,
    ProposalPreview,
    QuizQuestions,
    QuizResult,
    QuizSubmit,
    Remedy,
    ReviseRequest,
)
from app.services import execution, logs, profiles, proposals
from app.services.context import AppContext, get_ctx

router = APIRouter(prefix="/proposals", tags=["proposals"], responses=ERRORS)

ProposalId = Path(ge=1, le=2_147_483_647)


def _log_blocked(db: Session, user: User, action: str, reason: str) -> None:
    """A proposal request stopped by the T2 preconditions is itself an auditable event."""
    logs.add_now(db, user_id=user.id, actor="client", action=action, tier="T2", decision="denied", detail={"reason": reason})


@router.post("", response_model=Proposal, status_code=201)
def create_proposal(
    body: ProposalCreate, user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    profile = profiles.latest(db, user.id)
    problem = profiles.t2_error(profile, ctx)
    if problem is not None:
        _log_blocked(db, user, "proposal_created", problem.code)
        raise problem
    proposal = proposals.create(
        db, ctx, user, profile, amount=body.amount, horizon_years=body.horizon_years, near_term_need=body.near_term_need
    )
    return proposals.to_schema(proposal, ctx)


@router.get("", response_model=ProposalList)
def list_proposals(user: User = Depends(client_user), db: Session = Depends(get_db)) -> dict:
    return {"items": [proposals.summary(p) for p in proposals.list_for(db, user)]}


@router.get("/{proposal_id}", response_model=Proposal)
def get_proposal(
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return proposals.to_schema(proposals.get_owned(db, user, proposal_id), ctx)


@router.post("/{proposal_id}/revise", response_model=Proposal, status_code=201)
def revise(
    body: ReviseRequest,
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    parent = proposals.get_owned(db, user, proposal_id)
    profile = profiles.latest(db, user.id)
    problem = profiles.t2_error(profile, ctx)
    if problem is not None:
        _log_blocked(db, user, "proposal_revised", problem.code)
        raise problem
    proposal = proposals.revise(db, ctx, user, parent, profile, [i.model_dump() for i in body.items])
    return proposals.to_schema(proposal, ctx)


@router.post("/{proposal_id}/preview", response_model=ProposalPreview)
def preview(
    body: ReviseRequest,
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    """Addition: a dry run of a revision for the what-if lab. Same engines and gate as /revise; nothing is saved or logged."""
    parent = proposals.get_owned(db, user, proposal_id)
    profile = profiles.latest(db, user.id)
    problem = profiles.t2_error(profile, ctx)
    if problem is not None:
        raise problem
    return proposals.preview(ctx, parent, profile, [i.model_dump() for i in body.items])


@router.get("/{proposal_id}/remedy", response_model=Remedy)
def remedy(
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    """Addition: How to fix. The smallest change that passes the gate; apply it with /revise, where the gate runs again."""
    proposal = proposals.get_owned(db, user, proposal_id)
    if proposal.status not in proposals.OPEN_STATUSES:
        raise ApiError(409, "STATE_CONFLICT", f"This proposal is {proposal.status} and can no longer change.")
    profile = profiles.latest(db, user.id)
    problem = profiles.t2_error(profile, ctx)
    if problem is not None:
        raise problem
    return proposals.remedy(ctx, proposal, profile)


@router.post("/{proposal_id}/acknowledge", response_model=Proposal)
def acknowledge(
    body: AcknowledgeRequest,
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    proposal = proposals.get_owned(db, user, proposal_id)
    return proposals.to_schema(proposals.acknowledge(db, ctx, user, proposal, body.rule_ids), ctx)


@router.get("/{proposal_id}/quiz", response_model=QuizQuestions)
def get_quiz(
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return {"questions": proposals.quiz(proposals.get_owned(db, user, proposal_id), ctx)}


@router.post("/{proposal_id}/quiz", response_model=QuizResult)
def submit_quiz(
    body: QuizSubmit,
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    proposal = proposals.get_owned(db, user, proposal_id)
    return proposals.submit_quiz(db, ctx, user, proposal, body.answers)


@router.post("/{proposal_id}/confirm", response_model=ConfirmTokenResponse)
def confirm(
    proposal_id: int = ProposalId,
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return execution.confirm(db, ctx, user, proposals.get_owned(db, user, proposal_id))


@router.post("/{proposal_id}/execute", response_model=ExecuteResponse)
def execute(
    proposal_id: int = ProposalId,
    x_confirm_token: str | None = Header(default=None, max_length=100),
    user: User = Depends(client_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    return execution.execute(db, ctx, user, proposals.get_owned(db, user, proposal_id), x_confirm_token)
