"""Scenario 1 end to end through the API, plus AT-03 to AT-08 and AT-11 at the HTTP level."""

from __future__ import annotations

import json
import sqlite3

import pytest
from sqlalchemy import text

from tests.conftest import (
    AT03_ANSWERS,
    X2_ANSWERS,
    confirm_and_execute,
    create_proposal,
    pass_quiz,
    revise,
    sell_all,
    submit_profile,
    tier3_client,
)


def test_scenario_1_end_to_end(rina):
    # Steps 1-4: questionnaire with a contradiction, then fixed (AT-03, AT-04).
    assert len(rina.get("/api/profile/questionnaire").json()["questions"]) == 10
    flagged = submit_profile(rina, X2_ANSWERS)
    assert flagged["status"] == "needs_review" and [c["id"] for c in flagged["contradictions"]] == ["X2"]
    r = rina.post("/api/proposals", json={"amount": 200000, "horizon_years": 8, "near_term_need": 30000})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONTRADICTIONS_OPEN"
    profile = submit_profile(rina, AT03_ANSWERS)
    assert (profile["version"], profile["capacity_score"], profile["willingness_score"], profile["tier"]) == (2, 70, 70, 4)

    # Steps 5-6: the 2008 replay and "sell everything" lower the tier to 3 (AT-05).
    replay = rina.get("/api/replay/E1").json()
    assert replay["tier"] == 4 and replay["data_label"] == "Illustrative"
    profile = sell_all(rina)
    assert (profile["tier"], profile["replay_adjustment"], profile["replay"]) == (
        3,
        1,
        {"episode_id": "E1", "reaction": "sell_all"},
    )

    # Steps 7-8: the proposal of Section 2.6.5, gate PASS (AT-06, AT-08).
    p1 = create_proposal(rina)
    assert p1["status"] == "passed" and p1["gate"]["decision"] == "PASS" and len(p1["gate"]["rules"]) == 9
    assert [(i["product_code"], i["weight_pct"], i["amount"]) for i in p1["items"]] == [
        ("DEP-01", 15, 30000),
        ("SBF-01", 25, 50000),
        ("SBF-02", 25, 50000),
        ("GLD-01", 10, 20000),
        ("IDX-01", 25, 50000),
    ]
    assert [s["loss_cny"] for s in p1["stress"]] == [-12000, -13450, -25900]
    assert p1["metrics"]["weighted_fee_pct"] == 0.25 and p1["class_weights_pct"]["bond"] == 50

    # Steps 9-10: one equity fund to 60% -> REJECT on R-03; undo -> PASS (AT-07).
    p2 = revise(rina, p1["id"], {"DEP-01": 9, "SBF-01": 13, "SBF-02": 13, "GLD-01": 5, "IDX-01": 60}).json()
    assert p2["gate"]["decision"] == "REJECT" and p2["parent_id"] == p1["id"] and p2["version"] == 2
    assert "R-03" in [r["id"] for r in p2["gate"]["rules"] if r["result"] == "fail"]
    assert rina.get(f"/api/proposals/{p1['id']}").json()["status"] == "superseded"
    for method, path in (("post", "acknowledge"), ("get", "quiz"), ("post", "quiz"), ("post", "confirm")):
        kwargs = {"json": {"rule_ids": []} if path == "acknowledge" else {"answers": {}} if path == "quiz" else {}}
        r = getattr(rina, method)(f"/api/proposals/{p2['id']}/{path}", **(kwargs if method == "post" else {}))
        assert r.status_code == 409 and r.json()["error"]["code"] == "GATE_REJECTED", path
    p3 = revise(rina, p2["id"], {"DEP-01": 15, "SBF-01": 25, "SBF-02": 25, "GLD-01": 10, "IDX-01": 25}).json()
    assert p3["gate"]["decision"] == "PASS" and p3["version"] == 3

    # Step 11: the advisor answers from its tools (fallback mode here: no model key).
    chat = rina.post("/api/chat", json={"message": "Why this bond fund?", "proposal_id": p3["id"]}).json()
    assert chat["mode"] == "fallback" and chat["tool_calls"][0]["tool"] == "get_proposal"
    assert "SBF-01" in chat["reply"] and chat["citations"]

    # Step 12: quiz, Confirm, orders fill, advice record (AT-10).
    r = rina.post(f"/api/proposals/{p3['id']}/confirm", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "QUIZ_REQUIRED"
    pass_quiz(rina, p3["id"])
    result = confirm_and_execute(rina, p3["id"])
    assert result["status"] == "executed" and result["cash_after"] == 300000
    sbf = next(o for o in result["orders"] if o["product_code"] == "SBF-01")
    assert (sbf["units"], sbf["nav"], sbf["cost"]) == (46159.5273, 1.0832, 50000.0)

    account = rina.get("/api/sandbox/account").json()
    assert account["cash"] == 300000 and len(account["positions"]) == 5 and account["data_label"] == "Simulated"
    record = rina.get(f"/api/records/{result['record_id']}").json()
    assert record["prev_hash"] == "0" * 64 and record["content"]["proposal"]["status"] == "executed"
    assert record["content"]["quiz"]["passed"] is True and len(record["content"]["disclosures"]) == 3
    assert rina.post("/api/records/verify", json={"scope": "mine"}).json() == {
        "valid": True,
        "checked": 1,
        "broken_record_id": None,
    }

    # Postconditions: every step is in the operation log.
    actions = {e["action"] for e in rina.get("/api/logs?limit=200").json()["items"]}
    assert {
        "login",
        "profile_submitted",
        "replay_reaction",
        "proposal_created",
        "proposal_revised",
        "gate_decided",
        "tool_call",
        "quiz_attempted",
        "token_issued",
        "orders_executed",
        "record_created",
        "chain_verified",
    } <= actions


def test_at05_replay_only_sell_all_changes_anything_and_only_once(rina):
    submit_profile(rina)
    r = rina.post("/api/profile/current/replay-reaction", json={"episode_id": "E2", "reaction": "hold"}).json()
    assert r["tier"] == 4 and r["replay_adjustment"] == 0
    assert sell_all(rina, "E1")["tier"] == 3
    assert sell_all(rina, "E3")["tier"] == 3  # never more than one step
    r = rina.post("/api/profile/current/replay-reaction", json={"episode_id": "E1", "reaction": "hold"})
    assert r.status_code == 409  # one reaction per episode
    r = rina.post("/api/profile/current/replay-reaction", json={"episode_id": "E9", "reaction": "hold"})
    assert r.status_code == 422


def test_warning_needs_every_warning_acknowledged(rina):
    submit_profile(rina, {**AT03_ANSWERS, "W4": "a", "W3": "c"})  # max acceptable loss 5%, no contradiction
    proposal = create_proposal(rina, amount=100000, horizon=8, need=0)
    assert proposal["status"] == "warning"
    warned = [r["id"] for r in proposal["gate"]["rules"] if r["result"] == "fail"]
    assert warned and all(r["type"] == "soft" for r in proposal["gate"]["rules"] if r["result"] == "fail")
    pass_quiz(rina, proposal["id"])
    r = rina.post(f"/api/proposals/{proposal['id']}/confirm", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "WARNINGS_NOT_ACKNOWLEDGED"
    r = rina.post(f"/api/proposals/{proposal['id']}/acknowledge", json={"rule_ids": ["R-02"]})
    assert r.status_code == 422  # R-02 is not a warning on this proposal
    acknowledged = rina.post(f"/api/proposals/{proposal['id']}/acknowledge", json={"rule_ids": warned}).json()
    assert acknowledged["status"] == "acknowledged"
    assert rina.post(f"/api/proposals/{proposal['id']}/confirm", json={}).status_code == 200


def test_proposal_validation_and_preconditions(rina):
    r = rina.post("/api/proposals", json={"amount": 200000, "horizon_years": 8, "near_term_need": 0})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PROFILE_REQUIRED"
    tier3_client(rina)
    r = rina.post("/api/proposals", json={"amount": 600000, "horizon_years": 8, "near_term_need": 0})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INSUFFICIENT_CASH"
    r = rina.post("/api/proposals", json={"amount": 50000, "horizon_years": 8, "near_term_need": 60000})
    assert r.status_code == 422
    r = rina.post("/api/proposals", json={"amount": 50000, "horizon_years": 31, "near_term_need": 0})
    assert r.status_code == 422
    p = create_proposal(rina)
    r = revise(rina, p["id"], {"DEP-01": 50, "SBF-01": 40})
    assert r.status_code == 422  # weights total 90
    r = revise(rina, p["id"], {"DEP-01": 50, "XXX-99": 50})
    assert r.status_code == 422


def test_products_and_compare(rina, officer):
    tier3_client(rina)
    products = rina.get("/api/products").json()["items"]
    assert len(products) == 20
    assert {p["suitable"] for p in products if p["risk_level"] > 3} == {False}
    assert len(rina.get("/api/products?type=bond_fund&max_risk=2").json()["items"]) == 3
    assert rina.get("/api/products?q=gold").json()["items"][0]["code"].startswith("GLD")
    assert all(p["suitable"] is None for p in officer.get("/api/products").json()["items"])
    assert rina.get("/api/products/SBF-01").json()["nav"] == 1.0832
    assert rina.get("/api/products/NOPE-1").status_code == 404
    r = rina.post(
        "/api/products/compare", json={"product_codes": ["SBF-01", "SBF-02", "BND-01"], "amount": 50000, "horizon_years": 8}
    )
    assert [i["fee_cost"] for i in r.json()["items"]] == [1460.89, 1941.26, 2418.36]
    bad = rina.post("/api/products/compare", json={"product_codes": ["SBF-01"], "amount": 50000, "horizon_years": 8})
    assert bad.status_code == 422


def test_at11_tampering_with_a_stored_record_breaks_verification(app, rina, officer, settings):
    tier3_client(rina)
    record_ids = []
    for amount in (50000, 60000, 70000):
        p = create_proposal(rina, amount=amount, need=0)
        pass_quiz(rina, p["id"])
        record_ids.append(confirm_and_execute(rina, p["id"])["record_id"])
    assert rina.post("/api/records/verify", json={}).json() == {"valid": True, "checked": 3, "broken_record_id": None}

    # Layer 1: the database itself refuses edits to advice records.
    with app.state.engine.connect() as conn, pytest.raises(Exception, match="append-only"):
        conn.execute(text("UPDATE advice_records SET prev_hash = 'x' WHERE id = :id"), {"id": record_ids[1]})

    # Layer 2: someone with file access drops the trigger and edits a record; the chain catches it.
    path = settings.database_url.removeprefix("sqlite:///")
    raw = sqlite3.connect(path)
    content = json.loads(raw.execute("SELECT content FROM advice_records WHERE id = ?", (record_ids[1],)).fetchone()[0])
    content["proposal"]["amount"] = 1.0
    raw.execute("DROP TRIGGER advice_records_no_update")
    raw.execute("UPDATE advice_records SET content = ? WHERE id = ?", (json.dumps(content), record_ids[1]))
    raw.commit()
    raw.close()

    result = rina.post("/api/records/verify", json={}).json()
    assert result == {"valid": False, "checked": 2, "broken_record_id": record_ids[1]}
    assert officer.post("/api/records/verify", json={"scope": "all"}).json()["broken_record_id"] == record_ids[1]
