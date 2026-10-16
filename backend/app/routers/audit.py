"""Endpoints 24-32: sandbox account, advice records, operation log, evidence export, rules, health."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import client_user, compliance_user, current_user
from app.core.database import get_db
from app.engines.catalog import thaw
from app.models import User
from app.routers.common import ERRORS
from app.schemas import (
    AdviceRecord,
    HealthStatus,
    LogActor,
    LogDecision,
    LogPage,
    OrderList,
    RecordList,
    RuleList,
    SandboxAccount,
    VerifyRequest,
    VerifyResult,
)
from app.services import logs, records, sandbox
from app.services.context import AppContext, get_ctx

router = APIRouter(responses=ERRORS)


# --- Sandbox (FR-7.4) --------------------------------------------------------
@router.get("/sandbox/account", response_model=SandboxAccount, tags=["sandbox"])
def account(user: User = Depends(client_user), db: Session = Depends(get_db)) -> dict:
    return sandbox.account(db, user)


@router.get("/sandbox/orders", response_model=OrderList, tags=["sandbox"])
def orders(user: User = Depends(client_user), db: Session = Depends(get_db)) -> dict:
    return {"items": sandbox.orders(db, user)}


# --- Advice records (FR-8.1, FR-8.2, FR-8.5) -----------------------------------
@router.get("/records", response_model=RecordList, tags=["records"])
def list_records(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return {"items": [records.summary(r) for r in records.list_for(db, user)]}


@router.post("/records/verify", response_model=VerifyResult, tags=["records"])
def verify(body: VerifyRequest | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return records.verify(db, user, (body or VerifyRequest()).scope)


@router.get("/records/{record_id}", response_model=AdviceRecord, tags=["records"])
def get_record(
    record_id: int = Path(ge=1, le=2_147_483_647), user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    return records.to_schema(records.get_visible(db, user, record_id))


# --- Operation log (FR-8.3, FR-8.4) --------------------------------------------
@router.get("/logs", response_model=LogPage, tags=["logs"])
def list_logs(
    actor: LogActor | None = Query(default=None),
    action: str | None = Query(default=None, max_length=40),
    decision: LogDecision | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return logs.page(db, user, actor=actor, action=action, decision=decision, limit=limit, offset=offset)


@router.get(
    "/logs/export",
    tags=["logs"],
    response_class=Response,
    responses={200: {"content": {"application/json": {}, "text/csv": {}}, "description": "The whole operation log as a file"}},
)
def export_logs(
    format: Literal["json", "csv"] = Query(default="json"),  # noqa: A002 - the contract's parameter name
    user: User = Depends(compliance_user),
    db: Session = Depends(get_db),
) -> Response:
    # Logged first, so the export contains its own entry (Scenario 3: the export is itself logged).
    logs.add_now(
        db, user_id=user.id, actor="compliance", action="evidence_exported", decision="allowed", detail={"format": format}
    )
    body, media_type, filename = logs.export(db, format)
    return Response(body, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# --- Rules and health ----------------------------------------------------------
@router.get("/compliance/rules", response_model=RuleList, tags=["compliance"])
def rules(_user: User = Depends(current_user), ctx: AppContext = Depends(get_ctx)) -> dict:
    return {"items": [thaw(r) for r in ctx.catalog.rules]}


@router.get("/health", response_model=HealthStatus, tags=["health"])
def health(db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)) -> dict:
    db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "db": "ok",
        "llm": "ok" if ctx.llm is not None else "fallback",
        "data_as_of": ctx.catalog.products_as_of,
    }
