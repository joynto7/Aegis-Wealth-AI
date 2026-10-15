"""Shared router pieces: the documented error responses and small serializers."""

from __future__ import annotations

from typing import Any

from app.models import User
from app.schemas import ApiErrorBody

_ERROR = {"model": ApiErrorBody}

# Every route documents the one error envelope (Section 2.6.2), including 422,
# so the OpenAPI file describes what the API really returns.
ERRORS: dict[int | str, dict[str, Any]] = {
    401: {**_ERROR, "description": "UNAUTHENTICATED or INVALID_CREDENTIALS"},
    403: {**_ERROR, "description": "FORBIDDEN, TOKEN_INVALID or TOKEN_EXPIRED"},
    404: {**_ERROR, "description": "NOT_FOUND"},
    409: {**_ERROR, "description": "A state conflict, e.g. PROFILE_REQUIRED or GATE_REJECTED"},
    422: {**_ERROR, "description": "VALIDATION_ERROR; details.fields lists each field and problem"},
    429: {**_ERROR, "description": "RATE_LIMITED"},
    500: {**_ERROR, "description": "INTERNAL"},
}


def user_schema(user: User) -> dict[str, Any]:
    return {"id": user.id, "email": user.email, "role": user.role, "display_name": user.display_name}
