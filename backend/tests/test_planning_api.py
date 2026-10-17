"""Planning and what-if endpoints (additions): projections, goals, the briefing, live-portfolio analytics,
the dry-run preview and How to fix, with their permissions."""

from __future__ import annotations

from tests.conftest import confirm_and_execute, create_proposal, pass_quiz, revise, submit_profile, tier3_client

AT07 = {"DEP-01": 9, "SBF-01": 13, "SBF-02": 13, "GLD-01": 5, "IDX-01": 60}


def project(client, **body):
    return client.post("/api/projections", json=body)


# --- projections ------------------------------------------------------------------------
def test_projection_of_a_proposal_compares_every_tier_and_locks_those_above_the_client(rina):
    tier3_client(rina)
    p = create_proposal(rina)
    r = project(rina, basis="proposal", proposal_id=p["id"], target_amount=260_000)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["basis"] == {"kind": "proposal", "label": f"Proposal #{p['id']} (version 1)", "proposal_id": p["id"], "tier": 3}
    assert (body["amount"], body["horizon_years"], body["weighted_fee_pct"]) == (200_000, 8, 0.25)
    assert body["probability_target_pct"] == 22.5  # the engine's worked example
    assert [t["tier"] for t in body["tiers"]] == [1, 2, 3, 4, 5]
    assert [t["suitable"] for t in body["tiers"]] == [True, True, True, False, False]
    assert body["client_tier"] == 3 and body["data_label"].startswith("Illustrative")


def test_projection_of_a_tier_mix_and_of_the_live_portfolio(rina):
    tier3_client(rina)
    tier = project(rina, amount=50_000, horizon_years=5, monthly_contribution=2_000, target_amount=200_000).json()
    assert tier["basis"]["kind"] == "tier" and tier["basis"]["tier"] == 3 and tier["total_contributed"] == 170_000
    assert [r["confidence_pct"] for r in tier["required_monthly"]] == [50, 75, 90]

    account = project(rina, basis="account", horizon_years=3, compare_tiers=False).json()
    assert account["basis"]["label"] == "Your sandbox portfolio" and account["amount"] == 500_000
    assert account["class_weights_pct"]["cash"] == 100 and account["tiers"] == []


def test_projection_errors_and_ownership(rina, chen, officer):
    assert project(rina).status_code == 409  # no profile and no tier given
    assert project(rina, tier=2).status_code == 200
    tier3_client(rina)
    assert project(rina, basis="proposal").json()["error"]["code"] == "VALIDATION_ERROR"
    assert project(rina, amount=0, monthly_contribution=0).status_code == 422
    assert project(rina, unknown=1).status_code == 422
    p = create_proposal(rina)
    assert project(chen, basis="proposal", proposal_id=p["id"]).status_code == 403
    assert project(officer, tier=3).status_code == 403


# --- goals --------------------------------------------------------------------------------
def test_a_goal_is_saved_versioned_and_logged(rina):
    assert rina.get("/api/goals/current").json() == {"goal": None}
    body = {"name": "Home deposit", "target_amount": 300_000, "horizon_years": 8, "monthly_contribution": 1_500}
    first = rina.put("/api/goals/current", json=body).json()["goal"]
    second = rina.put("/api/goals/current", json={**body, "target_amount": 320_000}).json()["goal"]
    assert second["id"] > first["id"] and rina.get("/api/goals/current").json()["goal"]["target_amount"] == 320_000
    actions = [e["action"] for e in rina.get("/api/logs?limit=10").json()["items"]]
    assert actions.count("goal_set") == 2
    assert rina.put("/api/goals/current", json={**body, "horizon_years": 31}).status_code == 422


# --- briefing -------------------------------------------------------------------------------
def test_the_briefing_grows_with_the_clients_data(rina):
    first = rina.get("/api/insights").json()
    assert [i["id"] for i in first["items"]] == ["cash"] and "not written by the AI" in first["source"]

    tier3_client(rina)
    create_proposal(rina)
    rina.put("/api/goals/current", json={"name": "Home deposit", "target_amount": 260_000, "horizon_years": 8})
    items = {i["id"]: i for i in rina.get("/api/insights").json()["items"]}
    assert list(items) == ["goal", "fees", "liquidity", "stress", "margin", "replay", "cash"]
    assert items["goal"]["figure"] == "22.5%" and items["goal"]["tone"] == "attention"
    assert items["liquidity"]["figure"] == "2.7×"  # CNY 80,000 liquid against a CNY 30,000 need
    assert items["stress"]["tone"] == "positive" and items["stress"]["figure"] == "−12.95%"
    assert "Sell everything" in items["replay"]["body"]


def test_the_briefing_says_when_a_rule_is_over_its_limit(rina):
    tier3_client(rina)
    p = create_proposal(rina)
    margin = {i["id"]: i for i in rina.get("/api/insights").json()["items"]}["margin"]
    assert margin["title"] != "Over a rule's limit" and "is the closest" in margin["body"]
    revise(rina, p["id"], AT07)  # 60% in one product: the gate rejects it
    margin = {i["id"]: i for i in rina.get("/api/insights").json()["items"]}["margin"]
    assert (margin["title"], margin["tone"]) == ("Over a rule's limit", "attention")
    assert "is over its limit" in margin["body"] and float(margin["figure"].rstrip("%")) > 100


def test_analytics_of_the_live_portfolio_after_execution(rina):
    tier3_client(rina)
    p = create_proposal(rina)
    before = rina.get("/api/sandbox/analytics").json()
    assert (before["invested"], before["positions"], before["class_weights_pct"]["cash"]) == (0, 0, 100)
    pass_quiz(rina, p["id"])
    confirm_and_execute(rina, p["id"])
    after = rina.get("/api/sandbox/analytics").json()
    assert after["positions"] == 5 and after["invested"] > 0 and len(after["stress"]) == 3
    assert after["total_value"] == before["total_value"] or abs(after["total_value"] - before["total_value"]) < 1


# --- what-if preview ------------------------------------------------------------------------------
def test_preview_runs_the_gate_without_saving(rina, chen):
    tier3_client(rina)
    p = create_proposal(rina)
    items = [{"product_code": k, "weight_pct": v} for k, v in AT07.items()]
    r = rina.post(f"/api/proposals/{p['id']}/preview", json={"items": items})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["gate"]["decision"] == "REJECT" and body["total_pct"] == 100
    assert "R-03" in [x["id"] for x in body["gate"]["rules"] if x["result"] == "fail"]
    assert len(rina.get("/api/proposals").json()["items"]) == 1  # nothing saved

    partial = rina.post(f"/api/proposals/{p['id']}/preview", json={"items": items[:4]}).json()
    assert partial["total_pct"] == 40 and partial["gate"]["rules"][0]["result"] == "fail"  # R-01 shows while editing
    assert chen.post(f"/api/proposals/{p['id']}/preview", json={"items": items}).status_code == 403


# --- How to fix --------------------------------------------------------------------------------
def test_how_to_fix_then_apply_as_a_revision(rina, chen):
    tier3_client(rina)
    p = create_proposal(rina)
    rejected = revise(rina, p["id"], AT07).json()
    fix = rina.get(f"/api/proposals/{rejected['id']}/remedy")
    assert fix.status_code == 200, fix.text
    body = fix.json()
    assert (body["gate_before"], body["gate_after"], body["version"]) == ("REJECT", "PASS", 2)
    assert "R-03" in body["fixed_rule_ids"] and body["changes"]
    applied = rina.post(f"/api/proposals/{rejected['id']}/revise", json={"items": body["items"]})
    assert applied.status_code == 201 and applied.json()["gate"]["decision"] == "PASS"
    assert applied.json()["version"] == 3
    assert chen.get(f"/api/proposals/{rejected['id']}/remedy").status_code == 403


def test_how_to_fix_needs_a_current_profile(rina):
    submit_profile(rina)
    p = create_proposal(rina)
    submit_profile(rina, {**{f"C{i}": "a" for i in range(1, 6)}, "W1": "a", "W2": "a", "W3": "d", "W4": "a", "W5": "a"})
    r = rina.get(f"/api/proposals/{p['id']}/remedy")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONTRADICTIONS_OPEN"
