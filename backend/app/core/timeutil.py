"""UTC time helpers. The database stores naive UTC; the API speaks ISO 8601 with a Z (Section 2.6.1)."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
