"""Shared fixtures: a fresh database per test, fast bcrypt, no model key unless a test injects a fake."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.engines.catalog import load_catalog
from app.main import create_app

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# AT-03: capacity 70, willingness 70, tier 4.
AT03_ANSWERS = {"C1": "b", "C2": "d", "C3": "c", "C4": "b", "C5": "d", "W1": "c", "W2": "c", "W3": "d", "W4": "c", "W5": "b"}
# AT-04: W3 d with W4 a gives X2.
X2_ANSWERS = {**AT03_ANSWERS, "W4": "a"}
PASSWORD = "password123"


@pytest.fixture
def catalog():
    return load_catalog(DATA_DIR)


@pytest.fixture
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Settings]:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("BCRYPT_ROUNDS", "4")
    monkeypatch.setenv("DEMO_PASSWORD", PASSWORD)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


@pytest.fixture
def make_app(settings: Settings) -> Callable[..., Any]:
    def factory(llm: Any | None = None):
        return create_app(settings, llm=llm)

    return factory


@pytest.fixture
def app(make_app):
    return make_app()


@pytest.fixture
def clients(app) -> Iterator[Callable[[str | None], TestClient]]:
    """clients("rina@example.com") -> a TestClient with its own cookie jar, logged in; clients(None) -> anonymous."""
    with ExitStack() as stack:

        def open_client(email: str | None) -> TestClient:
            client = stack.enter_context(TestClient(app))
            if email:
                r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
                assert r.status_code == 200, r.text
            return client

        yield open_client


@pytest.fixture
def rina(clients) -> TestClient:
    return clients("rina@example.com")


@pytest.fixture
def chen(clients) -> TestClient:
    return clients("chen@example.com")


@pytest.fixture
def officer(clients) -> TestClient:
    return clients("officer@example.com")


# --- helpers used across API tests ------------------------------------------------
def submit_profile(client: TestClient, answers: dict[str, str] | None = None) -> dict:
    r = client.post("/api/profile", json={"answers": answers or AT03_ANSWERS})
    assert r.status_code == 201, r.text
    return r.json()


def sell_all(client: TestClient, episode: str = "E1") -> dict:
    r = client.post("/api/profile/current/replay-reaction", json={"episode_id": episode, "reaction": "sell_all"})
    assert r.status_code == 200, r.text
    return r.json()


def tier3_client(client: TestClient) -> dict:
    """Scenario 1, steps 1-6: tier 4 from the questionnaire, lowered to 3 by the replay."""
    submit_profile(client)
    return sell_all(client)


def create_proposal(client: TestClient, amount: float = 200_000, horizon: int = 8, need: float = 30_000) -> dict:
    r = client.post("/api/proposals", json={"amount": amount, "horizon_years": horizon, "near_term_need": need})
    assert r.status_code == 201, r.text
    return r.json()


def revise(client: TestClient, proposal_id: int, weights: dict[str, float]) -> Any:
    items = [{"product_code": code, "weight_pct": w} for code, w in weights.items()]
    return client.post(f"/api/proposals/{proposal_id}/revise", json={"items": items})


def correct_answers(proposal_id: int) -> dict[str, str]:
    """The canonical right answer is option 1, rotated by proposal_id mod 3 (Section 2.5.9)."""
    position = (-proposal_id) % 3
    return {q: str(position + 1) for q in ("Q1", "Q2", "Q3")}


def pass_quiz(client: TestClient, proposal_id: int) -> dict:
    r = client.post(f"/api/proposals/{proposal_id}/quiz", json={"answers": correct_answers(proposal_id)})
    assert r.status_code == 200 and r.json()["passed"], r.text
    return r.json()


def confirm_and_execute(client: TestClient, proposal_id: int) -> dict:
    token = client.post(f"/api/proposals/{proposal_id}/confirm", json={}).json()["confirm_token"]
    r = client.post(f"/api/proposals/{proposal_id}/execute", headers={"X-Confirm-Token": token}, json={})
    assert r.status_code == 200, r.text
    return r.json()


# --- a scripted stand-in for the Claude API -------------------------------------------
class ScriptedLLM:
    """Returns queued responses in order; records every request's messages."""

    def __init__(self, *responses: Any):
        self.responses = list(responses)
        self.requests: list[list[dict[str, Any]]] = []

    def create(self, *, messages: list[dict[str, Any]], timeout: float) -> Any:
        self.requests.append([dict(m) for m in messages])
        if not self.responses:
            raise AssertionError("ScriptedLLM ran out of responses")
        nxt = self.responses.pop(0)
        if isinstance(nxt, BaseException):
            raise nxt
        return nxt(messages) if callable(nxt) else nxt


def reply(stop_reason: str, *blocks: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=list(blocks))


def text(t: str) -> dict[str, Any]:
    return {"type": "text", "text": t}


def tool_use(block_id: str, name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_use", "id": block_id, "name": name, "input": tool_input}
