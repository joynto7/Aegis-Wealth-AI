"""The monitoring loop end to end (addition): the officer-only market clock, drift, alerts and the briefing, and
rebalancing proposals that go through the gate and the client's own Confirm. The agent can propose, never execute."""

from __future__ import annotations

from tests.conftest import (
    AT03_ANSWERS,
    PASSWORD,
    confirm_and_execute,
    create_proposal,
    pass_quiz,
    revise,
    submit_profile,
    tier3_client,
)

# Capacity 70 (tier 4), willingness 30 (tier 2): tier 2, the same 20% maximum loss as AT-03.
TIER2_ANSWERS = {**AT03_ANSWERS, "W1": "a", "W2": "a", "W3": "a", "W5": "c"}


def advance(officer, months=1, reason="Demo: move the simulated market"):
    r = officer.post("/api/compliance/market/advance", json={"months": months, "reason": reason})
    assert r.status_code == 200, r.text
    return r.json()


def invested(client):
    """Scenario 1: tier 3, CNY 200,000 for 8 years with CNY 30,000 needed soon, executed."""
    tier3_client(client)
    p = create_proposal(client)
    pass_quiz(client, p["id"])
    confirm_and_execute(client, p["id"])
    return p


def execute(client, proposal_id):
    pass_quiz(client, proposal_id)
    return confirm_and_execute(client, proposal_id)


def actions(client, limit=20):
    return [(e["action"], e["actor"], e["decision"]) for e in client.get(f"/api/logs?limit={limit}").json()["items"]]


# --- the clock -------------------------------------------------------------------------------
def test_only_the_compliance_officer_moves_the_market_with_a_logged_reason(rina, officer, clients):
    assert clients(None).post("/api/compliance/market/advance", json={"months": 1, "reason": "no session"}).status_code == 401
    assert rina.post("/api/compliance/market/advance", json={"months": 1, "reason": "I want a rally"}).status_code == 403
    assert rina.get("/api/compliance/market").status_code == 403
    assert officer.post("/api/compliance/market/advance", json={"months": 1, "reason": "x"}).status_code == 422
    assert officer.post("/api/compliance/market/advance", json={"months": 13, "reason": "too far ahead"}).status_code == 422
    assert officer.post("/api/compliance/market/advance", json={"months": 0, "reason": "standing still"}).status_code == 422

    before = officer.get("/api/compliance/market").json()
    assert (before["month"], before["as_of"], before["next_replay"], before["changed_at"]) == (0, "2026-09-30", "2009-03", None)
    after = advance(officer, 6, "Demo: six months of the 2009 rally")
    assert (after["month"], after["as_of"], after["replayed"]) == (6, "2027-03-31", "2009-08")
    assert after["reason"] == "Demo: six months of the 2009 rally" and after["changed_by"] == "Amara (Compliance)"
    assert after["data_label"].startswith("Illustrative")

    entry = next(e for e in officer.get("/api/logs?action=market_advanced").json()["items"])
    assert (entry["actor"], entry["decision"]) == ("compliance", "allowed")
    assert entry["detail"]["reason"] == "Demo: six months of the 2009 rally"
    assert entry["detail"]["replayed"] == ["2009-03", "2009-04", "2009-05", "2009-06", "2009-07", "2009-08"]
    assert rina.post("/api/compliance/market/advance", json={"months": 1, "reason": "still not allowed"}).status_code == 403
    assert officer.get("/api/compliance/market").json()["month"] == 6


def test_the_market_moves_the_shelf_and_the_value_of_positions(rina, officer):
    invested(rina)
    assert rina.get("/api/products/IDX-01").json()["nav"] == 3.452
    value_before = rina.get("/api/sandbox/account").json()["total_value"]
    advance(officer, 6)
    product = rina.get("/api/products/IDX-01").json()
    assert (product["nav"], product["nav_date"]) == (4.7896, "2027-03-31")
    account = rina.get("/api/sandbox/account").json()
    idx = next(p for p in account["positions"] if p["product_code"] == "IDX-01")
    assert idx["value"] == 69_374.28 and account["total_value"] > value_before
    # Clients see the clock's date and moves in their own view, not who moved it or why.
    market = rina.get("/api/monitoring").json()["market"]
    assert market["month"] == 6 and market["reason"] is None and market["changed_by"] is None


# --- drift, the briefing and the Control Room ---------------------------------------------------
def test_drift_beyond_the_band_reaches_the_client_and_the_officer(rina, officer):
    p = invested(rina)
    view = rina.get("/api/monitoring").json()
    assert view["status"] == "on_target" and view["target_proposal_id"] == p["id"] and view["portfolio_drift_pct"] == 0.0
    assert [i["id"] for i in rina.get("/api/insights").json()["items"]][:1] != ["drift"]  # the market has not moved

    advance(officer, 6)
    view = rina.get("/api/monitoring").json()
    assert view["status"] == "drifted" and view["total_value"] == 226_295.1 and view["band_pp"] == 5
    assert view["largest"] == {"asset_class": "equity", "drift_pp": 5.66} and view["portfolio_drift_pct"] == 5.8
    equity = next(c for c in view["classes"] if c["asset_class"] == "equity")
    assert (equity["target_pct"], equity["current_pct"], equity["outside_band"]) == (25.0, 30.66, True)
    # The live gate: more equity now breaks the client's drawdown tolerance (a soft rule), new since she confirmed.
    assert view["live_gate"] == "WARNING"
    assert [(f["id"], f["type"], f["new"]) for f in view["rules_failing"]] == [("R-08", "soft", True)]
    assert view["rebalance"]["sell_total"] == 13_126.91 and view["open_rebalance"] is None

    first = rina.get("/api/insights").json()["items"][0]
    assert (first["id"], first["tone"], first["title"], first["figure"]) == (
        "drift",
        "attention",
        "Your portfolio has drifted",
        "+5.66 pts",
    )
    assert "30.66%" in first["body"] and "CNY 13,127" in first["body"] and first["href"] == "/account#risk"

    alert = next(a for a in officer.get("/api/compliance/overview").json()["alerts"] if a["id"] == "drift-2")  # Rina is client #2
    assert alert["severity"] == "medium" and alert["title"] == "Portfolio drift beyond the band"
    assert "30.66% against a 25% target (+5.66 points; the band is 5)" in alert["detail"]
    overview = officer.get("/api/compliance/monitoring").json()
    assert overview["counts"] == {"on_target": 0, "drifted": 1, "rule_breach": 0}
    row = overview["clients"][0]
    assert (row["client"], row["status"], row["new_failures"]) == ("Rina", "drifted", ["R-08"])
    assert "never rebalances on its own" in overview["policy"]


def test_a_holding_at_the_limit_breaks_r03_after_one_month_of_rally(rina, officer):
    tier3_client(rina)
    p = create_proposal(rina)
    r = revise(rina, p["id"], {"DEP-01": 15, "SBF-01": 25, "SBF-02": 10, "GLD-01": 10, "IDX-01": 40})
    assert r.status_code == 201, r.text
    v2 = r.json()
    assert v2["gate"]["decision"] == "WARNING"  # 40% is allowed; the drawdown warning is acknowledged below
    soft = [rule["id"] for rule in v2["gate"]["rules"] if rule["result"] == "fail"]
    assert rina.post(f"/api/proposals/{v2['id']}/acknowledge", json={"rule_ids": soft}).status_code == 200
    execute(rina, v2["id"])

    advance(officer, 1)
    view = rina.get("/api/monitoring").json()
    assert view["status"] == "rule_breach" and view["live_gate"] == "REJECT"
    r03 = next(f for f in view["rules_failing"] if f["id"] == "R-03")
    assert r03["new"] is True and "Sample Broad Index ETF A" in r03["message"]
    alert = next(a for a in officer.get("/api/compliance/overview").json()["alerts"] if a["id"] == "drift-2")
    assert alert["severity"] == "high" and "R-03 (Concentration) now fails" in alert["detail"]
    insight = rina.get("/api/insights").json()["items"][0]
    assert insight["title"] == "A rule now fails on what you hold" and "Concentration (R-03)" in insight["body"]


# --- rebalancing -------------------------------------------------------------------------------
def test_a_rebalancing_is_a_new_version_through_the_gate_and_the_clients_confirm(rina, officer):
    p = invested(rina)
    advance(officer, 6)
    orders_before = len(rina.get("/api/sandbox/orders").json()["items"])
    r = rina.post("/api/proposals/rebalance", json={})
    assert r.status_code == 201, r.text
    rb = r.json()
    assert (rb["parent_id"], rb["version"], rb["status"], rb["gate"]["decision"]) == (p["id"], 2, "passed", "PASS")
    assert rb["amount"] == 226_295.1 and [i["weight_pct"] for i in rb["items"]] == [15, 25, 25, 10, 25]
    plan = rb["rebalance"]
    assert (plan["source_proposal_id"], plan["market_month"], plan["market_as_of"], plan["stale"]) == (
        p["id"],
        6,
        "2027-03-31",
        False,
    )
    assert [(t["side"], t["product_code"]) for t in plan["trades"]][:2] == [("sell", "GLD-01"), ("sell", "IDX-01")]
    assert "sells 2,672.5613 units" in next(i["rationale"] for i in rb["items"] if i["product_code"] == "IDX-01")
    # Proposing does not trade, and asking again returns the same proposal.
    assert len(rina.get("/api/sandbox/orders").json()["items"]) == orders_before
    assert rina.post("/api/proposals/rebalance", json={}).json()["id"] == rb["id"]
    assert next(s for s in rina.get("/api/proposals").json()["items"] if s["id"] == rb["id"])["kind"] == "rebalance"
    assert rina.get("/api/monitoring").json()["open_rebalance"] == {
        "proposal_id": rb["id"],
        "version": 2,
        "status": "passed",
        "gate_decision": "PASS",
        "stale": False,
    }

    # Execution needs the quiz, the Confirm click and the one-time token, as for any proposal.
    assert rina.post(f"/api/proposals/{rb['id']}/confirm", json={}).json()["error"]["code"] == "QUIZ_REQUIRED"
    done = execute(rina, rb["id"])
    assert [(o["side"], o["product_code"]) for o in done["orders"]] == [
        ("sell", "GLD-01"),
        ("sell", "IDX-01"),
        ("buy", "DEP-01"),
        ("buy", "SBF-01"),
        ("buy", "SBF-02"),
    ]
    after = rina.get("/api/monitoring").json()
    assert after["status"] == "on_target" and after["target_proposal_id"] == rb["id"] and after["portfolio_drift_pct"] == 0.0
    record = rina.get(f"/api/records/{done['record_id']}").json()["content"]
    assert record["proposal"]["rebalance"]["source_proposal_id"] == p["id"] and record["orders"][0]["side"] == "sell"
    assert ("rebalance_proposed", "client", "allowed") in actions(rina, 40)
    # Back on target, there is nothing to trade, so no empty rebalancing is saved.
    nothing = rina.post("/api/proposals/rebalance", json={})
    assert nothing.status_code == 409 and "nothing to trade" in nothing.json()["error"]["message"]


def test_a_rebalancing_priced_before_the_market_moved_cannot_go_ahead(rina, officer):
    invested(rina)
    advance(officer, 6)
    rb = rina.post("/api/proposals/rebalance", json={}).json()
    pass_quiz(rina, rb["id"])
    token = rina.post(f"/api/proposals/{rb['id']}/confirm", json={}).json()["confirm_token"]
    advance(officer, 1, "Demo: one more month")
    # Between Confirm and Execute: refused, and the refusal is logged.
    r = rina.post(f"/api/proposals/{rb['id']}/execute", headers={"X-Confirm-Token": token}, json={})
    assert (
        r.status_code == 409
        and r.json()["error"]["code"] == "STATE_CONFLICT"
        and "Prices or holdings" in r.json()["error"]["message"]
    )
    assert ("orders_executed", "client", "denied") in actions(rina)
    stale = rina.get(f"/api/proposals/{rb['id']}").json()
    assert stale["rebalance"]["stale"] is True
    assert rina.post(f"/api/proposals/{rb['id']}/confirm", json={}).json()["error"]["code"] == "STATE_CONFLICT"
    assert rina.get(f"/api/proposals/{rb['id']}/remedy").json()["error"]["code"] == "STATE_CONFLICT"
    assert revise(rina, rb["id"], {i["product_code"]: i["weight_pct"] for i in rb["items"]}).status_code == 409
    # A fresh one replaces it at today's prices.
    fresh = rina.post("/api/proposals/rebalance", json={}).json()
    assert fresh["id"] != rb["id"] and fresh["rebalance"]["market_month"] == 7
    assert rina.get(f"/api/proposals/{rb['id']}").json()["status"] == "superseded"
    assert execute(rina, fresh["id"])["status"] == "executed"


def test_how_to_fix_applies_when_the_clients_tier_fell_since(rina, officer):
    invested(rina)
    advance(officer, 6)
    submit_profile(rina, TIER2_ANSWERS)  # tier 2 now: the gold and index funds are risk level 3
    rb = rina.post("/api/proposals/rebalance", json={}).json()
    assert rb["status"] == "rejected" and {"R-02"} <= {r["id"] for r in rb["gate"]["rules"] if r["result"] == "fail"}
    view = rina.get("/api/monitoring").json()
    assert view["status"] == "rule_breach" and any(f["id"] == "R-02" and f["new"] for f in view["rules_failing"])
    fix = rina.get(f"/api/proposals/{rb['id']}/remedy").json()
    assert fix["gate_after"] in ("PASS", "WARNING") and "R-02" in fix["fixed_rule_ids"]
    applied = revise(rina, rb["id"], {i["product_code"]: i["weight_pct"] for i in fix["items"]})
    assert applied.status_code == 201, applied.text
    child = applied.json()
    assert child["parent_id"] == rb["id"] and child["rebalance"]["source_proposal_id"] == rb["rebalance"]["source_proposal_id"]
    sold = {t["product_code"] for t in child["rebalance"]["trades"] if t["side"] == "sell"}
    assert {"GLD-01", "IDX-01"} <= sold  # the unsuitable holdings are sold in full
    assert all(i["rationale"].startswith(f"Rebalancing of proposal #{rb['parent_id']}") for i in child["items"])


def test_rebalancing_needs_an_executed_portfolio_and_a_current_profile(rina, officer, chen):
    assert rina.post("/api/proposals/rebalance", json={}).json()["error"]["code"] == "PROFILE_REQUIRED"
    assert ("rebalance_proposed", "client", "denied") in actions(rina)
    tier3_client(rina)
    r = rina.post("/api/proposals/rebalance", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "STATE_CONFLICT"
    assert rina.get("/api/monitoring").json()["status"] == "none"
    assert officer.post("/api/proposals/rebalance", json={}).status_code == 403
    assert officer.get("/api/monitoring").status_code == 403


def test_a_client_cannot_see_or_act_on_another_clients_rebalancing(rina, chen, officer):
    invested(rina)
    advance(officer, 6)
    rb = rina.post("/api/proposals/rebalance", json={}).json()
    for request in (
        lambda: chen.get(f"/api/proposals/{rb['id']}"),
        lambda: chen.post(f"/api/proposals/{rb['id']}/quiz", json={"answers": {}}),
        lambda: chen.post(f"/api/proposals/{rb['id']}/confirm", json={}),
        lambda: chen.post(f"/api/proposals/{rb['id']}/execute", headers={"X-Confirm-Token": "x" * 43}, json={}),
        lambda: chen.get(f"/api/proposals/{rb['id']}/remedy"),
    ):
        assert request().status_code == 403
    assert chen.get("/api/monitoring").json()["status"] == "none"  # Chen sees only his own (empty) portfolio
    assert chen.get("/api/compliance/monitoring").status_code == 403


# --- the agent proposes, never executes ------------------------------------------------------------
def test_the_advisor_checks_drift_and_proposes_a_rebalancing_but_cannot_execute_it(rina, officer):
    invested(rina)
    advance(officer, 6)
    orders = len(rina.get("/api/sandbox/orders").json()["items"])

    r = rina.post("/api/chat", json={"message": "Has my portfolio drifted?"}).json()
    assert [(t["tool"], t["tier"], t["decision"]) for t in r["tool_calls"]] == [("check_drift", "T1", "allowed")]
    card = next(c for c in r["cards"] if c["type"] == "drift")
    assert card["status"] == "drifted" and card["largest"] == {"asset_class": "equity", "drift_pp": 5.66}
    assert "30.66%" in r["reply"] and "+5.66 points" in r["reply"]

    r = rina.post("/api/chat", json={"message": "Please rebalance my portfolio"}).json()
    assert [(t["tool"], t["tier"], t["decision"]) for t in r["tool_calls"]] == [("propose_rebalance", "T2", "allowed")]
    card = next(c for c in r["cards"] if c["type"] == "proposal")
    assert card["kind"] == "rebalance" and card["gate_decision"] == "PASS"
    assert "I can't place it" in r["reply"]

    r = rina.post("/api/chat", json={"message": "Rebalance and execute it now"}).json()
    assert "can't place orders" in r["reply"]
    assert len(rina.get("/api/sandbox/orders").json()["items"]) == orders  # the AI placed nothing
    assert ("rebalance_proposed", "agent", "allowed") in actions(rina, 40)
    kpis = officer.get("/api/compliance/overview").json()["kpis"]
    assert kpis["orders_by_agent"] == 0 and kpis["tool_calls_t2"] == 1


def test_the_broker_refuses_an_execution_tool_and_requires_t2_for_proposing(make_app, clients):
    from tests.conftest import ScriptedLLM, reply, text, tool_use

    llm = ScriptedLLM(
        reply("tool_use", tool_use("t1", "propose_rebalance", {}), tool_use("t2", "execute_rebalance", {"proposal_id": 1})),
        reply("end_turn", text("I can't execute anything; you need a current risk profile first.")),
    )
    from fastapi.testclient import TestClient

    with TestClient(make_app(llm=llm)) as client:
        assert client.post("/api/auth/login", json={"email": "chen@example.com", "password": PASSWORD}).status_code == 200
        r = client.post("/api/chat", json={"message": "Rebalance for me and execute it"}).json()
    calls = [(t["tool"], t["tier"], t["decision"]) for t in r["tool_calls"]]
    assert calls == [("propose_rebalance", "T2", "denied"), ("execute_rebalance", "T2", "denied")]
    blocked = [c for c in r["cards"] if c["type"] == "blocked"]
    assert {c["tier"] for c in blocked} == {"T2", "T3"}
