"""Endpoints 1-3: log in, log out, current user (FR-1.1, FR-1.2)."""

from __future__ import annotations

import math
from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import COOKIE_NAME, client_ip, current_user
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.security import burn_password_check, new_session_id, sha256_hex, verify_password
from app.core.timeutil import utcnow
from app.models import SessionRow, User
from app.routers.common import ERRORS, user_schema
from app.schemas import LoginRequest, UserEnvelope
from app.services import logs
from app.services.context import AppContext, get_ctx

router = APIRouter(prefix="/auth", tags=["auth"], responses=ERRORS)


@router.post("/login", response_model=UserEnvelope)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    if not ctx.login_limiter.hit(client_ip(request, ctx.settings)):
        raise ApiError(429, "RATE_LIMITED", "Too many log-in attempts. Try again in a minute.")
    email = body.email.strip().lower()
    locked = ctx.lockout.locked_for(email)
    if locked:
        logs.add_now(db, user_id=None, actor="system", action="login", decision="denied", detail={"reason": "locked_out"})
        minutes = max(1, math.ceil(locked / 60))
        raise ApiError(429, "RATE_LIMITED", f"Too many failed attempts for this account. Try again in {minutes} minute(s).")
    user = db.scalars(select(User).where(func.lower(User.email) == email)).first()
    if user is None:
        burn_password_check(body.password, ctx.settings.bcrypt_rounds)
        ok = False
    else:
        ok = verify_password(body.password, user.password_hash)
    if not ok:
        just_locked = ctx.lockout.record_failure(email)
        logs.add_now(
            db,
            user_id=user.id if user else None,
            actor="system",
            action="login",
            decision="denied",
            detail={"reason": "invalid_credentials", "locked": just_locked},
        )
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    ctx.lockout.record_success(email)
    session_id = new_session_id()
    ttl = timedelta(hours=ctx.settings.session_ttl_hours)
    db.add(SessionRow(id=sha256_hex(session_id), user_id=user.id, expires_at=utcnow() + ttl))
    logs.add(db, user_id=user.id, actor=logs.actor_of(user), action="login", decision="allowed")
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=int(ttl.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=ctx.settings.cookie_secure,
        path="/",
    )
    return {"user": user_schema(user)}


@router.post("/logout", status_code=204, response_class=Response)
def logout(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    row = db.get(SessionRow, request.state.session_key)
    if row is not None:
        db.delete(row)
    logs.add(db, user_id=user.id, actor=logs.actor_of(user), action="logout", decision="allowed")
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return response


@router.get("/me", response_model=UserEnvelope)
def me(user: User = Depends(current_user)) -> dict:
    return {"user": user_schema(user)}
