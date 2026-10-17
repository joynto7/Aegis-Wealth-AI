"""Historical replay (Section 2.5.2): V_t = V_{t-1} (1 + sum_c w_c r_{c,t}), from CNY 100,000.

Addition: the client may start from their own amount (the path scales with it,
so the drawdown is the same), and the result carries the episode's real-world
events for the animated replay.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.engines.catalog import ASSET_CLASSES, Episode, MonthlyReturn
from app.engines.numbers import round1, round2

START_VALUE = 100_000.0


def run_replay(
    episode: Episode,
    tier: int,
    weights_pct: Mapping[str, float],
    history: tuple[MonthlyReturn, ...],
    *,
    data_label: str,
    data_as_of: str,
    start_value: float = START_VALUE,
    events_label: str = "",
) -> dict[str, Any]:
    rows = [r for r in history if episode.start <= r.month <= episode.end]
    value = peak = lowest_value = start_value
    lowest_month = episode.start
    max_drawdown = 0.0
    series: list[dict[str, Any]] = []
    for row in rows:
        r = sum((weights_pct[c] / 100) * row.of(c) for c in ASSET_CLASSES)
        value *= 1 + r
        series.append({"month": row.month, "value": round2(value)})
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak)
        if value < lowest_value:
            lowest_value, lowest_month = value, row.month
    return {
        "episode": {"id": episode.id, "name": episode.name, "start": episode.start, "end": episode.end},
        "tier": tier,
        "weights_pct": {c: weights_pct[c] for c in ASSET_CLASSES},
        "start_value": round2(start_value),
        "series": series,
        "max_drawdown_pct": round1(max_drawdown * 100),
        "lowest_month": lowest_month,
        "end_value": round2(value),
        "data_label": data_label,
        "data_as_of": data_as_of,
        "events": [{"month": e["month"], "text": e["text"]} for e in episode.events],
        "events_label": events_label,
    }
