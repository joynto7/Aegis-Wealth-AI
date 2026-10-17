"""Confirmation tokens and the execution guard (AT-10; Section 2.5.10): expiry, reuse, binding, missing."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.timeutil import utcnow
from app.models import ConfirmToken, Order
from tests.conftest import create_proposal, pass_quiz, revise, tier3_client


def ready(client):
    tier3_client(client)
    p = create_proposal(client)
    pass_quiz(client, p["id"])
    return p


def execute(client, proposal_id, token):
    headers = {"X-Confirm-Token": token} if token is not None else {}
    return client.post(f"/api/proposals/{proposal_id}/execute", headers=headers, json={})


def test_at10_execute_without_or_with_an_unknown_token(rina):
    p = ready(rina)
    for token in (None, "made-up-token"):
        r = execute(rina, p["id"], token)
        assert r.status_code == 403 and r.json()["error"]["code"] == "TOKEN_INVALID"


def test_at10_token_expires_after_five_minutes(rina, monkeypatch):
    p = ready(rina)
    token = rina.post(f"/api/proposals/{p['id']}/confirm", json={}).json()["confirm_token"]
    later = utcnow() + timedelta(minutes=5, seconds=1)
    monkeypatch.setattr("app.services.execution.utcnow", lambda: later)
    r = execute(rina, p["id"], token)
    assert r.status_code == 403 and r.json()["error"]["code"] == "TOKEN_EXPIRED"


def test_at10_a_token_works_once(rina):
    p = ready(rina)
    token = rina.post(f"/api/proposals/{p['id']}/confirm", json={}).json()["confirm_token"]
    assert execute(rina, p["id"], token).status_code == 200
    r = execute(rina, p["id"], token)
    assert r.status_code == 409 and r.json()["error"]["code"] == "TOKEN_USED"


def test_token_is_bound_to_its_proposal_and_its_items(rina):
    p = ready(rina)
    other = create_proposal(rina, amount=50000, need=0)
    token = rina.post(f"/api/proposals/{p['id']}/confirm", json={}).json()["confirm_token"]
    assert execute(rina, other["id"], token).json()["error"]["code"] == "TOKEN_INVALID"
    # Revising after confirm supersedes the confirmed version: the old token can't execute it.
    revise(rina, p["id"], {"DEP-01": 15, "SBF-01": 25, "SBF-02": 25, "GLD-01": 10, "IDX-01": 25})
    r = execute(rina, p["id"], token)
    assert r.status_code == 409 and r.json()["error"]["code"] == "STATE_CONFLICT"


def test_only_the_token_hash_is_stored(app, rina):
    p = ready(rina)
    token = rina.post(f"/api/proposals/{p['id']}/confirm", json={}).json()["confirm_token"]
    with app.state.session_factory() as db:
        stored = db.scalars(select(ConfirmToken)).all()
        assert len(stored) == 1 and stored[0].token_hash != token and len(stored[0].token_hash) == 64


def test_denied_attempts_place_no_orders_and_are_logged(app, rina):
    p = ready(rina)
    execute(rina, p["id"], None)
    execute(rina, p["id"], "forged")
    with app.state.session_factory() as db:
        assert db.scalars(select(Order)).all() == []
    denied = rina.get("/api/logs?action=orders_executed&decision=denied").json()
    assert denied["total"] == 2 and {e["detail"]["reason"] for e in denied["items"]} == {"TOKEN_INVALID"}
