"""Log-in, roles, sessions and request hardening (AT-01; Sections 2.6.2, 2.8.2)."""

from __future__ import annotations

from sqlalchemy import select

from app.core.security import sha256_hex
from app.models import SessionRow
from tests.conftest import PASSWORD


def test_at01_wrong_password_gives_one_generic_401(clients):
    c = clients(None)
    for email in ("rina@example.com", "nobody@example.com"):
        r = c.post("/api/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 401
        assert r.json() == {"error": {"code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect."}}


def test_at01_client_cannot_export_logs_but_the_officer_can(rina, officer):
    r = rina.get("/api/logs/export?format=json")
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    r = officer.get("/api/logs/export?format=csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0] == "id,ts,user_id,actor,action,tool,tier,decision,detail"
    assert "evidence_exported" in r.text  # the export is itself logged


def test_session_cookie_flags_and_server_side_session(app, clients):
    c = clients(None)
    r = c.post("/api/auth/login", json={"email": "rina@example.com", "password": PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert "aegis_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    assert "session_token" not in r.json()  # the session never appears in a response body
    raw = c.cookies["aegis_session"]
    assert len(raw) == 64  # 256-bit id
    with app.state.session_factory() as db:
        assert db.get(SessionRow, sha256_hex(raw)) is not None  # only the hash is stored
        assert db.scalars(select(SessionRow).where(SessionRow.id == raw)).first() is None


def test_logout_deletes_the_session(rina):
    assert rina.post("/api/auth/logout", json={}).status_code == 204
    assert rina.get("/api/auth/me").status_code == 401


def test_every_endpoint_except_login_and_health_needs_a_session(clients):
    c = clients(None)
    assert c.get("/api/health").status_code == 200
    for method, path in [
        ("get", "/api/auth/me"),
        ("get", "/api/products"),
        ("get", "/api/proposals"),
        ("get", "/api/records"),
        ("get", "/api/logs"),
        ("get", "/api/compliance/rules"),
        ("post", "/api/chat"),
    ]:
        r = getattr(c, method)(path, **({"json": {"message": "hi"}} if method == "post" else {}))
        assert r.status_code == 401, path
        assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_compliance_officer_is_read_only(officer):
    assert officer.post("/api/profile", json={"answers": {}}).status_code == 403
    assert officer.post("/api/proposals", json={"amount": 10000, "horizon_years": 5, "near_term_need": 0}).status_code == 403
    assert officer.post("/api/chat", json={"message": "hello"}).status_code == 403
    assert officer.get("/api/logs").status_code == 200
    assert officer.get("/api/compliance/rules").json()["items"][0]["id"] == "R-01"


def test_login_rate_limit_per_ip(clients):
    c = clients(None)
    # Different emails, so the per-account lock-out (5 failures) doesn't trigger first.
    codes = [c.post("/api/auth/login", json={"email": f"x{i}@example.com", "password": "x"}).status_code for i in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_account_lockout_after_repeated_failures(app, clients):
    c = clients(None)
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": "chen@example.com", "password": "nope"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": "chen@example.com", "password": PASSWORD})
    assert r.status_code == 429 and "Too many failed attempts" in r.json()["error"]["message"]
    app.state.ctx.lockout.reset()
    assert c.post("/api/auth/login", json={"email": "chen@example.com", "password": PASSWORD}).status_code == 200


def test_cross_site_and_form_posts_are_refused(rina):
    r = rina.post("/api/profile", json={"answers": {}}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    r = rina.post("/api/auth/logout", content="a=1", headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 422


def test_error_envelope_for_validation_and_unknown_routes(rina):
    r = rina.post("/api/proposals", json={"amount": "lots"})
    body = r.json()
    assert r.status_code == 422 and body["error"]["code"] == "VALIDATION_ERROR"
    assert {f["field"] for f in body["error"]["details"]["fields"]} >= {"amount", "horizon_years"}
    r = rina.get("/api/nowhere")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    r = rina.post("/api/proposals", json={"amount": 20000, "horizon_years": 5, "near_term_need": 0, "extra": 1})
    assert r.status_code == 422  # unknown fields are rejected


def test_security_headers(rina):
    r = rina.get("/api/auth/me")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
