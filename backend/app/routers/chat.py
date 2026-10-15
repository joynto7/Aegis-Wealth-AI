"""Endpoints 22-23: the advisor chat and its history (Module 6), plus a streaming variant (P1)."""

from __future__ import annotations

import json
import queue
import threading
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import client_user
from app.core.database import get_db
from app.core.errors import ApiError, error_body
from app.models import User
from app.routers.common import ERRORS
from app.schemas import ChatHistory, ChatReply, ChatRequest
from app.services import chat
from app.services.context import AppContext, get_ctx

router = APIRouter(prefix="/chat", tags=["chat"], responses=ERRORS)


def _rate_limit(ctx: AppContext, user: User) -> None:
    if not ctx.chat_limiter.hit(f"user:{user.id}"):
        raise ApiError(429, "RATE_LIMITED", "Too many messages. Wait a minute and try again.")


@router.post("", response_model=ChatReply)
def send(
    body: ChatRequest, user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    _rate_limit(ctx, user)
    return chat.turn(db, ctx, user, body.message, body.proposal_id)


@router.get("/history", response_model=ChatHistory)
def history(
    limit: int = Query(default=50, ge=1, le=200), user: User = Depends(client_user), db: Session = Depends(get_db)
) -> dict:
    return {"items": chat.history(db, user, limit)}


@router.post(
    "/stream",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Server-sent events: status, tool, reply"}},
)
def stream(
    body: ChatRequest, request: Request, user: User = Depends(client_user), ctx: AppContext = Depends(get_ctx)
) -> StreamingResponse:
    """Addition (P1, streaming chat): the same checked turn, with progress events while it runs.

    Events: `status` (what the agent is doing), `tool` (each broker decision as
    it happens), then one `reply` (the full ChatReply, after the grounding
    check) or `error`. Text is never streamed before it is checked.
    """
    _rate_limit(ctx, user)
    events: queue.Queue[tuple[str, dict] | None] = queue.Queue()
    # The turn runs in its own thread with its own database session, so events can flow while it works.
    factory = request.app.state.session_factory

    def run() -> None:
        with factory() as db:
            try:
                reply = chat.turn(db, ctx, user, body.message, body.proposal_id, on_event=lambda e: events.put((e["type"], e)))
                events.put(("reply", reply))
            except ApiError as exc:
                events.put(("error", error_body(exc.code, exc.message, exc.details)))
            except Exception:  # noqa: BLE001 - reported to the client as INTERNAL, logged by the thread
                events.put(("error", error_body("INTERNAL", "Something went wrong. Please try again.")))
            finally:
                events.put(None)

    threading.Thread(target=run, daemon=True).start()

    def frames() -> Iterator[str]:
        while (item := events.get()) is not None:
            kind, payload = item
            yield f"event: {kind}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(frames(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})
