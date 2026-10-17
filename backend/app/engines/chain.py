"""Advice-record hash chain (Section 2.5.11): h_n = SHA256(h_{n-1} || canonical(content_n)), h_0 = 64 zeros."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from typing import Any

GENESIS_HASH = "0" * 64


def canonical(content: Any) -> str:
    return json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def next_hash(prev_hash: str, content: Any) -> str:
    return hashlib.sha256((prev_hash + canonical(content)).encode("utf-8")).hexdigest()


def first_broken(records: Iterable[tuple[int, str, Any]]) -> tuple[int, int | None]:
    """Walks (id, stored_hash, content) in id order; returns (checked, id of the first record whose hash differs)."""
    prev = GENESIS_HASH
    checked = 0
    for record_id, stored, content in records:
        checked += 1
        if next_hash(prev, content) != stored:
            return checked, record_id
        prev = stored
    return checked, None


def items_hash(items: Iterable[tuple[str, float]]) -> str:
    """Binds a confirmation token to the exact items: (product code, weight) pairs in order."""
    return hashlib.sha256(canonical([[code, float(w)] for code, w in items]).encode("utf-8")).hexdigest()
