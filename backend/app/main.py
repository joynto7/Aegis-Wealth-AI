"""The FastAPI application (Section 2.10.1). Run with: uvicorn app.main:create_app --factory"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import Settings, get_settings
from app.core.database import Base, make_engine, make_session_factory
from app.core.errors import error_body, install_error_handlers
from app.engines.catalog import load_catalog
from app.models import add_missing_columns
from app.routers import audit, auth, chat, oversight, planning, products, profile, proposals
from app.seed import seed_if_empty
from app.services.context import AppContext

API_VERSION = "1.0.0"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
REJECTED_CONTENT_TYPES = ("application/x-www-form-urlencoded", "multipart/form-data", "text/plain")


def create_app(settings: Settings | None = None, llm: Any | None = None) -> FastAPI:
    settings = settings or get_settings()
    catalog = load_catalog(settings.data_dir)
    if llm is None and settings.anthropic_api_key:
        from app.agent.llm import ClaudeClient

        llm = ClaudeClient(settings.anthropic_api_key, settings.model, settings.llm_timeout_seconds)
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        Base.metadata.create_all(engine)
        for column in add_missing_columns(engine):
            logging.getLogger("aegis").info("Added column %s", column)
        if seed_if_empty(app.state.session_factory, settings, catalog):
            logging.getLogger("aegis").info("Seeded demo accounts and products")
        yield
        engine.dispose()

    app = FastAPI(
        title="Aegis Wealth AI API",
        version=API_VERSION,
        description=(
            "Wealth-advisory agent in a simulated sandbox. Every number comes from deterministic engines; the "
            "language model only asks, talks and explains. All products and data are sample or hypothetical."
        ),
        lifespan=lifespan,
    )
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.ctx = AppContext.build(settings, catalog, llm)
    install_error_handlers(app)

    @app.middleware("http")
    async def harden(request: Request, call_next):  # noqa: ANN001, ANN202
        if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
            # CSRF defence in depth on top of the SameSite=Lax cookie: no cross-site origins,
            # and no body types an HTML form can send.
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins:
                return JSONResponse(error_body("FORBIDDEN", "Cross-site requests are not allowed."), status_code=403)
            content_type = request.headers.get("content-type", "").lower()
            if content_type.startswith(REJECTED_CONTENT_TYPES):
                return JSONResponse(error_body("VALIDATION_ERROR", "Requests must be sent as JSON."), status_code=422)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    for module in (auth, profile, products, proposals, planning, chat, audit, oversight):
        app.include_router(module.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/docs")

    return app
