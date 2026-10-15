"""Settings from the environment (Section 2.10.5). No secret has a default."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    database_url: str
    data_dir: Path
    session_ttl_hours: int
    # Model access: empty key means fallback mode (FR-6.4, AT-12).
    anthropic_api_key: str | None
    model: str
    llm_timeout_seconds: float
    # Cookie and request hardening (Section 2.8.2).
    cookie_secure: bool
    allowed_origins: tuple[str, ...]
    trust_proxy_headers: bool
    bcrypt_rounds: int
    # Abuse limits (Section 2.6.2: 429 RATE_LIMITED; P1 lock-out).
    login_attempts_per_minute: int
    chat_messages_per_minute: int
    lockout_threshold: int
    lockout_minutes: int
    # Seeded demo accounts (FR-1.4). A demo credential, not a secret.
    demo_password: str


@lru_cache
def get_settings() -> Settings:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    origins = os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"
    )
    return Settings(
        database_url=os.environ.get("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'data' / 'aegis.db'}"),
        data_dir=Path(os.environ.get("AEGIS_DATA_DIR", str(BACKEND_DIR / "data"))),
        session_ttl_hours=_env_int("SESSION_TTL_HOURS", 8),
        anthropic_api_key=key or None,
        model=os.environ.get("AEGIS_MODEL", "claude-opus-5-5"),
        llm_timeout_seconds=_env_float("LLM_TIMEOUT_SECONDS", 20.0),
        cookie_secure=_env_bool("COOKIE_SECURE", False),
        allowed_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        trust_proxy_headers=_env_bool("TRUST_PROXY_HEADERS", False),
        bcrypt_rounds=_env_int("BCRYPT_ROUNDS", 12),
        login_attempts_per_minute=_env_int("LOGIN_ATTEMPTS_PER_MINUTE", 10),
        chat_messages_per_minute=_env_int("CHAT_MESSAGES_PER_MINUTE", 20),
        lockout_threshold=_env_int("LOCKOUT_THRESHOLD", 5),
        lockout_minutes=_env_int("LOCKOUT_MINUTES", 5),
        demo_password=os.environ.get("DEMO_PASSWORD", "password123"),
    )
