"""A client sees only their own data (AT-02, FR-1.3)."""

from __future__ import annotations

from tests.conftest import confirm_and_execute, create_proposal, pass_quiz, tier3_client


def test_at02_client_a_gets_403_for_client_b_proposal_record_and_more(rina, chen):
    tier3_client(rina)
    proposal = create_proposal(rina)
    pass_quiz(rina, proposal["id"])
    record_id = confirm_and_execute(rina, proposal["id"])["record_id"]
    rina.post("/api/chat", json={"message": "What's my risk tier?"})

    pid = proposal["id"]
    for method, path in [
        ("get", f"/api/proposals/{pid}"),
        ("get", f"/api/proposals/{pid}/quiz"),
        ("post", f"/api/proposals/{pid}/revise"),
        ("post", f"/api/proposals/{pid}/confirm"),
        ("get", f"/api/records/{record_id}"),
    ]:
        kwargs = {"json": {"items": [{"product_code": "DEP-01", "weight_pct": 100}]}} if path.endswith("revise") else {}
        if method == "post" and not kwargs:
            kwargs = {"json": {}}
        r = getattr(chen, method)(path, **kwargs)
        assert r.status_code == 403, (path, r.text)
        assert r.json()["error"]["code"] == "FORBIDDEN"

    # Chat history and lists are always the caller's own.
    assert chen.get("/api/chat/history").json()["items"] == []
    assert chen.get("/api/proposals").json()["items"] == []
    assert chen.get("/api/records").json()["items"] == []
    assert all(entry["user_id"] == 3 for entry in chen.get("/api/logs").json()["items"])
    assert chen.post("/api/chat", json={"message": "hi", "proposal_id": pid}).status_code == 403


def test_client_cannot_verify_every_chain(rina, officer):
    assert rina.post("/api/records/verify", json={"scope": "all"}).status_code == 403
    assert officer.post("/api/records/verify", json={"scope": "all"}).json()["valid"] is True


def test_officer_reads_every_record_but_cannot_change_anything(rina, officer):
    tier3_client(rina)
    proposal = create_proposal(rina)
    pass_quiz(rina, proposal["id"])
    record_id = confirm_and_execute(rina, proposal["id"])["record_id"]
    assert officer.get(f"/api/records/{record_id}").status_code == 200
    assert [r["id"] for r in officer.get("/api/records").json()["items"]] == [record_id]
    assert officer.get(f"/api/proposals/{proposal['id']}").status_code == 403
