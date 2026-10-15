"""The one error envelope (Section 2.6.2) and the handlers that guarantee it (NFR-2.3)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("aegis")


class ApiError(Exception):
    """An expected failure with a contract error code, e.g. ApiError(409, "GATE_REJECTED", ...)."""

    def __init__(self, status: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {"error": error}


def validation_error(message: str, fields: list[dict[str, str]]) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", message, {"fields": fields})


def _field_name(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header")]
    return ".".join(parts) or "body"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [{"field": _field_name(tuple(e.get("loc", ()))), "problem": e.get("msg", "invalid")} for e in exc.errors()]
        return JSONResponse(
            error_body("VALIDATION_ERROR", "Some fields are missing or invalid.", {"fields": fields}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return JSONResponse(error_body("NOT_FOUND", "There is nothing at this address."), status_code=404)
        if exc.status_code == 405:
            return JSONResponse(error_body("VALIDATION_ERROR", "This method is not allowed here."), status_code=405)
        return JSONResponse(error_body("INTERNAL", "Something went wrong. Please try again."), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception) -> JSONResponse:
        # Logged on the server only: no stack trace or internal detail reaches the browser.
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(error_body("INTERNAL", "Something went wrong. Please try again."), status_code=500)
