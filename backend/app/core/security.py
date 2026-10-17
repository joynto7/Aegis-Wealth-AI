"""Passwords, session ids and confirmation tokens (NFR-3.1, NFR-3.2, Section 2.5.10)."""

from __future__ import annotations

import hashlib
import secrets
from functools import lru_cache

import bcrypt


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


@lru_cache
def _dummy_hash(rounds: int) -> str:
    return hash_password(secrets.token_urlsafe(16), rounds)


def burn_password_check(password: str, rounds: int) -> None:
    """Spend the same bcrypt time for an unknown email, so timing doesn't reveal which emails exist."""
    verify_password(password, _dummy_hash(rounds))


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_session_id() -> str:
    """A random 256-bit session id. Only its SHA-256 is stored, so a leaked database holds no live sessions."""
    return secrets.token_hex(32)


def new_confirm_token() -> str:
    """secrets.token_urlsafe(32), returned to the client once; only its SHA-256 is stored (Section 2.5.10)."""
    return secrets.token_urlsafe(32)
