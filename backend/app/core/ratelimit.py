"""In-memory abuse limits: per-IP log-in attempts, per-user chat messages, per-account lock-out.

A single API process serves the demo, so memory is enough; a multi-instance
deployment would move these counters to a shared store (listed in the
security self-assessment as a limitation).
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    """Allows at most `limit` hits per key within `window_seconds`."""

    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        """Records a hit and returns True if it is within the limit."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class AccountLockout:
    """Locks an account for `minutes` after `threshold` consecutive failed log-ins (P1 lock-out)."""

    def __init__(self, threshold: int, minutes: int):
        self.threshold = threshold
        self.seconds = minutes * 60
        self._failures: dict[str, int] = defaultdict(int)
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    def locked_for(self, account: str) -> float:
        """Seconds the account stays locked, or 0."""
        with self._lock:
            until = self._locked_until.get(account, 0.0)
            remaining = until - time.monotonic()
            if remaining <= 0 and account in self._locked_until:
                del self._locked_until[account]
                self._failures.pop(account, None)
            return max(0.0, remaining)

    def record_failure(self, account: str) -> bool:
        """Counts a failure; returns True if this failure locked the account."""
        with self._lock:
            self._failures[account] += 1
            if self._failures[account] >= self.threshold:
                self._locked_until[account] = time.monotonic() + self.seconds
                self._failures[account] = 0
                return True
            return False

    def record_success(self, account: str) -> None:
        with self._lock:
            self._failures.pop(account, None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()
            self._locked_until.clear()
