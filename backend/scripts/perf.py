"""Performance check (Section 2.9.3, NFR-1): 20 calls to each deterministic endpoint and 10 chat turns.

Targets: deterministic endpoints p95 under 2 seconds; chat turns under 10 seconds.

    python scripts/perf.py                                 # in-process, fresh database
    python scripts/perf.py --base-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

PASSWORD = os.environ.get("DEMO_PASSWORD", "password123")
AT03 = {"C1": "b", "C2": "d", "C3": "c", "C4": "b", "C5": "d", "W1": "c", "W2": "c", "W3": "d", "W4": "c", "W5": "b"}


def p95(samples: list[float]) -> float:
    ordered = sorted(samples)
    return ordered[max(0, round(0.95 * len(ordered)) - 1)]


def make_client(base_url: str | None):
    if base_url:
        import httpx

        return httpx.Client(base_url=base_url, timeout=60.0)
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    # Always a fresh database: the run must not touch the live demo data (the Docker image sets DATABASE_URL).
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'perf.db'}"
    os.environ["CHAT_MESSAGES_PER_MINUTE"] = "1000"
    get_settings.cache_clear()
    client = TestClient(create_app())
    client.__enter__()
    return client


def timed(client, method: str, path: str, **kwargs) -> float:
    started = time.perf_counter()
    r = client.request(method, path, **kwargs)
    elapsed = time.perf_counter() - started
    if r.status_code >= 400:
        raise SystemExit(f"{method} {path} -> {r.status_code}: {r.text}")
    return elapsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Time the API against NFR-1")
    parser.add_argument("--base-url")
    parser.add_argument("--out", default=str(BACKEND.parent / "evidence" / "perf.json"))
    args = parser.parse_args()
    c = make_client(args.base_url)
    c.request("POST", "/api/auth/login", json={"email": "chen@example.com", "password": PASSWORD}).raise_for_status()
    c.request("POST", "/api/profile", json={"answers": AT03}).raise_for_status()
    proposal = c.request("POST", "/api/proposals", json={"amount": 100000, "horizon_years": 8, "near_term_need": 10000}).json()
    pid = proposal["id"]

    endpoints = [
        ("GET", "/api/profile/current", {}),
        ("GET", "/api/replay/E1", {}),
        ("GET", "/api/products", {}),
        (
            "POST",
            "/api/products/compare",
            {"json": {"product_codes": ["SBF-01", "SBF-02", "BND-01"], "amount": 50000, "horizon_years": 8}},
        ),
        ("POST", "/api/proposals", {"json": {"amount": 50000, "horizon_years": 5, "near_term_need": 0}}),
        ("GET", f"/api/proposals/{pid}", {}),
        ("GET", f"/api/proposals/{pid}/quiz", {}),
        ("GET", "/api/sandbox/account", {}),
        ("POST", "/api/records/verify", {"json": {"scope": "mine"}}),
        ("GET", "/api/logs?limit=50", {}),
        # Additions: the replay from the client's own amount, the switches' state and the regulatory map.
        ("GET", "/api/replay/E1?amount=200000", {}),
        ("GET", "/api/controls", {}),
        ("GET", "/api/compliance/regulations", {}),
        # v2: goal projection (1,000 paths, plus the same goal under all five tiers), the what-if dry run,
        # How to fix, the briefing and live-portfolio analytics.
        ("POST", "/api/projections", {"json": {"basis": "proposal", "proposal_id": pid, "target_amount": 150000}}),
        (
            "POST",
            "/api/projections",
            {
                "json": {
                    "basis": "tier",
                    "amount": 100000,
                    "horizon_years": 30,
                    "monthly_contribution": 2000,
                    "target_amount": 2000000,
                }
            },
        ),
        (
            "POST",
            f"/api/proposals/{pid}/preview",
            {"json": {"items": [{"product_code": i["product_code"], "weight_pct": i["weight_pct"]} for i in proposal["items"]]}},
        ),
        ("GET", f"/api/proposals/{pid}/remedy", {}),
        ("GET", "/api/insights", {}),
        ("GET", "/api/sandbox/analytics", {}),
    ]
    results = []

    def measure(method: str, path: str, kwargs: dict) -> None:
        samples = [timed(c, method, path, **kwargs) for _ in range(20)]
        label = path if "amount=" in path else path.split("?")[0]
        if path == "/api/projections":
            label += " (30 years, all tiers)" if kwargs["json"].get("horizon_years") == 30 else " (proposal, all tiers)"
        results.append(
            {
                "endpoint": f"{method} {label}",
                "calls": 20,
                "p95_ms": round(p95(samples) * 1000, 1),
                "median_ms": round(statistics.median(samples) * 1000, 1),
                "ok": p95(samples) < 2.0,
            }
        )

    for method, path, kwargs in endpoints:
        measure(method, path, kwargs)
    chat_samples = [timed(c, "POST", "/api/chat", json={"message": "What's my risk tier?"}) for _ in range(10)]
    chat_mode = c.request("GET", "/api/health").json()["llm"]
    # The compliance Control Room's live view and the model disclosure, as the officer.
    c.request("POST", "/api/auth/login", json={"email": "officer@example.com", "password": PASSWORD}).raise_for_status()
    for path in ("/api/compliance/overview", "/api/compliance/model-card", "/api/compliance/reviews?status=all"):
        measure("GET", path, {})
    latest_turn = c.request("GET", "/api/compliance/overview").json()["turns"][0]["log_id"]
    measure("GET", f"/api/compliance/turns/{latest_turn}", {})
    report = {
        "run_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "target": "deterministic p95 < 2 s; chat < 10 s (NFR-1.1, NFR-1.2)",
        "endpoints": results,
        "chat": {
            "turns": 10,
            "mode": chat_mode,
            "max_ms": round(max(chat_samples) * 1000, 1),
            "median_ms": round(statistics.median(chat_samples) * 1000, 1),
            "ok": max(chat_samples) < 10.0,
        },
    }
    report["result"] = "PASS" if all(r["ok"] for r in results) and report["chat"]["ok"] else "FAIL"
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    worst = max(results, key=lambda r: r["p95_ms"])
    print(
        f"Performance {report['result']}: slowest p95 {worst['p95_ms']} ms ({worst['endpoint']}); chat max {report['chat']['max_ms']} ms ({chat_mode})"
    )
    print(f"  report: {out}")
    sys.exit(0 if report["result"] == "PASS" else 1)


if __name__ == "__main__":
    main()
