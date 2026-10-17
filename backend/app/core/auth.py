"""Session cookie authentication and role checks (FR-1.3, NFR-3.2, NFR-3.3).

The server decides access on every request; the frontend only hides controls.
"""

from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.security import sha256_hex
from app.core.timeutil import utcnow
from app.models import SessionRow, User

COOKIE_NAME = "aegis_session"


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        raise ApiError(401, "UNAUTHENTICATED", "Please log in.")
    row = db.get(SessionRow, sha256_hex(session_id))
    if row is None:
        raise ApiError(401, "UNAUTHENTICATED", "Please log in.")
    if row.expires_at <= utcnow():
        db.delete(row)
        db.commit()
        raise ApiError(401, "UNAUTHENTICATED", "Your session expired. Please log in again.")
    user = db.get(User, row.user_id)
    if user is None:
        raise ApiError(401, "UNAUTHENTICATED", "Please log in.")
    request.state.session_key = row.id
    return user


def client_user(user: User = Depends(current_user)) -> User:
    if user.role != "client":
        raise ApiError(403, "FORBIDDEN", "Your account cannot use this feature.")
    return user


def compliance_user(user: User = Depends(current_user)) -> User:
    if user.role != "compliance":
        raise ApiError(403, "FORBIDDEN", "Only the compliance officer can use this feature.")
    return user


def client_ip(request: Request, settings: Settings) -> str:
    """The caller's IP for rate limiting; X-Forwarded-For is trusted only behind our own proxy."""
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
