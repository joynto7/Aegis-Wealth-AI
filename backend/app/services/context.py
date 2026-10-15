"""Process-wide state shared by every request: settings, data catalog, abuse limits, model client."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.core.config import Settings
from app.core.ratelimit import AccountLockout, SlidingWindowLimiter
from app.engines.catalog import Catalog


@dataclass
class AppContext:
    settings: Settings
    catalog: Catalog
    login_limiter: SlidingWindowLimiter
    chat_limiter: SlidingWindowLimiter
    lockout: AccountLockout
    llm: Any | None  # app.agent.llm.ClaudeClient, or None in fallback mode

    @classmethod
    def build(cls, settings: Settings, catalog: Catalog, llm: Any | None) -> AppContext:
        return cls(
            settings=settings,
            catalog=catalog,
            login_limiter=SlidingWindowLimiter(settings.login_attempts_per_minute, 60),
            chat_limiter=SlidingWindowLimiter(settings.chat_messages_per_minute, 60),
            lockout=AccountLockout(settings.lockout_threshold, settings.lockout_minutes),
            llm=llm,
        )


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx
