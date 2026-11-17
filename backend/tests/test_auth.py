"""Tests für Registrierung, Anmeldung, Sessions, Logout und CSRF-Schutz."""

import hashlib
from datetime import timedelta
from http.cookies import SimpleCookie

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.security import utcnow
from tests.conftest import PASSWORD, user_payload

COOKIE = "pivault_session"


def parse_cookie(response, name=COOKIE):
    for header in response.headers.get_list("set-cookie"):
        jar = SimpleCookie()
        jar.load(header)
        if name in jar:
            return jar[name]
    return None


def db_user(db, username="anna.beispiel"):
    return db.execute(text("SELECT * FROM users WHERE username = :u"), {"u": username}).mappings().one()


def session_rows(db):
    return db.execute(text("SELECT * FROM sessions")).mappings().all()


# ============================================================ Registrierung
class TestRegister:
    def test_success(self, client, db):
        r = client.post("/api/auth/register", json=user_payload())
        assert r.status_code == 201
        body = r.json()
        assert body["username"] == "anna.beispiel"
        assert body["email"] == "anna@example.org"
        assert body["email_verified"] is False  # keine vorgetäuschte Verifizierung
        assert set(body) == {"id", "username", "first_name", "last_name", "email", "email_verified"}
        row = db_user(db)
        assert row["account_status"] == "active"
        assert row["email_verified_at"] is None
        # Tresor-Schlüsselfelder bleiben unberührt (Tresor noch nicht eingerichtet)
        for col in ("master_kdf_salt", "master_kdf_params", "encrypted_vault_key", "vault_key_nonce", "vault_key_tag"):
            assert row[col] is None
        assert r.headers["cache-control"] == "no-store"

    def test_registration_creates_no_session(self, client, db):
        r = client.post("/api/auth/register", json=user_payload())
        assert parse_cookie(r) is None
        assert session_rows(db) == []

    def test_password_stored_only_as_argon2id_hash(self, client, db):
        client.post("/api/auth/register", json=user_payload())
        row = db_user(db)
        assert row["password_hash"].startswith("$argon2id$")
        assert PASSWORD not in row["password_hash"]
        # Das Klartextpasswort steht in keiner Spalte
        assert all(PASSWORD not in str(v) for v in row.values())

    def test_response_never_contains_password_or_hash(self, client):
        r = client.post("/api/auth/register", json=user_payload())
        assert PASSWORD not in r.text and "argon2" not in r.text and "password" not in r.text

    @pytest.mark.parametrize(
        "other",
        [
            {"username": "andere", "email": "ANNA@EXAMPLE.ORG"},  # gleiche E-Mail, andere Schreibweise
            {"username": "ANNA.BEISPIEL", "email": "neu@example.org"},  # gleicher Benutzername, andere Schreibweise
        ],
    )
    def test_duplicate_email_or_username(self, client, db, registered, other):
        r = client.post("/api/auth/register", json=user_payload(**other))
        assert r.status_code == 409
        # verrät nicht, welches Feld vergeben ist
        assert r.json() == {"detail": "Benutzername oder E-Mail-Adresse ist bereits vergeben."}
        assert db.execute(text("SELECT COUNT(*) FROM users")).scalar() == 1

    @pytest.mark.parametrize(
        "overrides",
        [
            {"password": "kurz"},
            {"password": "a" * 11},
            {"password": "a" * 129},
            {"password": "gültig-aber\x00mit-NUL-zeichen"},
            {"email": "keine-email"},
            {"email": "a@b"},
            {"email": "x" * 250 + "@example.org"},
            {"username": "ab"},
            {"username": "a" * 51},
            {"username": "mit leerzeichen"},
            {"username": "mit@at.de"},
            {"username": ".beginntmitpunkt"},
            {"username": "<script>"},
            {"first_name": ""},
            {"first_name": "   "},
            {"last_name": "x" * 101},
            {"first_name": "Ann\x07a"},
        ],
    )
    def test_invalid_input_rejected(self, client, db, overrides):
        r = client.post("/api/auth/register", json=user_payload(**overrides))
        assert r.status_code == 422
        assert db.execute(text("SELECT COUNT(*) FROM users")).scalar() == 0
        # Eingegebene Werte (z. B. das Passwort) werden nicht zurückgespiegelt
        assert PASSWORD not in r.text
        for err in r.json()["detail"]:
            assert set(err) == {"field", "message"}

    def test_validation_error_does_not_echo_password(self, client):
        r = client.post("/api/auth/register", json=user_payload(password="zu-kurz"))
        assert r.status_code == 422
        assert "zu-kurz" not in r.text
        assert r.json()["detail"][0]["field"] == "password"

    @pytest.mark.parametrize("missing", ["username", "first_name", "last_name", "email", "password"])
    def test_missing_field(self, client, missing):
        data = user_payload()
        del data[missing]
        r = client.post("/api/auth/register", json=data)
        assert r.status_code == 422
        assert r.json()["detail"][0]["field"] == missing

    def test_unknown_field_rejected(self, client):
        r = client.post("/api/auth/register", json=user_payload(account_status="admin"))
        assert r.status_code == 422

    def test_master_password_fields_cannot_be_set_via_register(self, client):
        r = client.post("/api/auth/register", json=user_payload(master_password="geheim", master_kdf_salt="x"))
        assert r.status_code == 422

    @pytest.mark.parametrize("content", [b"kein json", b"[]", b""])
    def test_malformed_body(self, client, content):
        r = client.post("/api/auth/register", content=content, headers={"content-type": "application/json"})
        assert r.status_code == 422

    def test_non_json_content_type_rejected(self, client):
        r = client.post("/api/auth/register", content="username=a", headers={"content-type": "text/plain"})
        assert r.status_code == 422

    def test_email_is_normalized(self, client, db):
        client.post("/api/auth/register", json=user_payload(email="  Anna@EXAMPLE.org "))
        assert db_user(db)["email"] == "anna@example.org"

    def test_unicode_names_and_password(self, client, db):
        r = client.post(
            "/api/auth/register",
            json=user_payload(first_name="Zoë", last_name="Müller-Åström", password="pässwörd-mit-ümlauten-123"),
        )
        assert r.status_code == 201
        login = client.post("/api/auth/login", json={"identifier": "anna.beispiel", "password": "pässwörd-mit-ümlauten-123"})
        assert login.status_code == 200


# ============================================================ Anmeldung
class TestLogin:
    @pytest.mark.parametrize("identifier", ["anna@example.org", "anna.beispiel", "ANNA@Example.ORG", "Anna.Beispiel", "  anna.beispiel  "])
    def test_login_with_email_or_username(self, client, registered, identifier):
        r = client.post("/api/auth/login", json={"identifier": identifier, "password": PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["username"] == "anna.beispiel"
        assert "password" not in r.text and "argon2" not in r.text
        assert len(body["csrf_token"]) == 64

    def test_wrong_password_and_unknown_user_have_identical_response(self, client, registered):
        wrong = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": "falsches-passwort-123"})
        unknown = client.post("/api/auth/login", json={"identifier": "niemand@example.org", "password": "falsches-passwort-123"})
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()
        assert parse_cookie(wrong) is None and parse_cookie(unknown) is None

    def test_failed_login_creates_no_session(self, client, db, registered):
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": "falsches-passwort-123"})
        assert session_rows(db) == []

    def test_login_updates_last_login_at(self, client, db, registered):
        assert db_user(db)["last_login_at"] is None
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        last = db_user(db)["last_login_at"]
        assert last is not None and abs(utcnow() - last) < timedelta(seconds=10)

    def test_failed_login_does_not_update_last_login_at(self, client, db, registered):
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": "falsches-passwort-123"})
        assert db_user(db)["last_login_at"] is None

    @pytest.mark.parametrize("body", [{}, {"identifier": "x"}, {"password": "x"}, {"identifier": "", "password": "x"}, {"identifier": "x", "password": ""}, {"identifier": "x", "password": "p" * 129}])
    def test_invalid_login_input(self, client, body):
        assert client.post("/api/auth/login", json=body).status_code == 422

    def test_password_hash_cannot_be_used_as_password(self, client, db, registered):
        stored = db_user(db)["password_hash"]
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": stored[:128]})
        assert r.status_code == 401

    @pytest.mark.parametrize("status", ["locked", "disabled", "irgendwas"])
    def test_inactive_account_blocked(self, client, db, registered, status):
        db.execute(text("UPDATE users SET account_status = :s"), {"s": status})
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        assert r.status_code == 403
        assert parse_cookie(r) is None and session_rows(db) == []

    def test_locked_until_in_future_blocks_login(self, client, db, registered):
        db.execute(text("UPDATE users SET locked_until = :t"), {"t": utcnow() + timedelta(hours=1)})
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        assert r.status_code == 403 and session_rows(db) == []

    def test_locked_until_in_past_allows_login(self, client, db, registered):
        db.execute(text("UPDATE users SET locked_until = :t"), {"t": utcnow() - timedelta(minutes=1)})
        assert client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}).status_code == 200

    def test_locked_account_with_wrong_password_looks_like_wrong_password(self, client, db, registered):
        db.execute(text("UPDATE users SET account_status = 'locked'"))
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": "falsches-passwort-123"})
        assert r.status_code == 401  # Sperrstatus wird ohne korrektes Passwort nicht verraten


# ============================================================ Sessions und Cookie
class TestSession:
    def test_session_created_with_token_hash_only(self, client, db, registered):
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}, headers={"user-agent": "pytest-agent"})
        token = client.cookies.get(COOKIE)
        rows = session_rows(db)
        assert len(rows) == 1
        row = rows[0]
        assert bytes(row["token_hash"]) == hashlib.sha256(token.encode()).digest()
        assert len(row["token_hash"]) == 32
        # das rohe Token steht weder in der DB noch in der JSON-Antwort
        assert all(token not in str(v) for v in row.values())
        assert token not in r.text
        assert row["user_agent"] == "pytest-agent"
        assert row["ip_address"]
        assert row["expires_at"] - row["created_at"] == timedelta(minutes=settings.session_lifetime_minutes)

    def test_token_has_at_least_32_bytes_and_is_unique(self, client, registered):
        tokens = set()
        for _ in range(3):
            client.cookies.clear()
            client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
            tokens.add(client.cookies.get(COOKIE))
        assert len(tokens) == 3
        assert all(len(t) >= 43 for t in tokens)  # 32 Byte, URL-sicher base64-kodiert

    def test_cookie_flags(self, client, registered):
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        cookie = parse_cookie(r)
        assert cookie["httponly"] is True
        assert cookie["samesite"].lower() == "lax"
        assert cookie["path"] == "/"
        assert int(cookie["max-age"]) == settings.session_lifetime_minutes * 60
        assert not cookie["secure"]  # lokal über HTTP
        assert "domain" not in {k for k, v in cookie.items() if v}

    def test_cookie_secure_flag_configurable(self, client, registered, monkeypatch):
        monkeypatch.setattr(settings, "cookie_secure", True)
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        assert parse_cookie(r)["secure"] is True
        # auch beim Löschen des Cookies
        assert "Secure" in [h for h in r.headers.get_list("set-cookie")][0]

    def test_relogin_replaces_previous_session_of_same_browser(self, client, db, registered):
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        first = client.cookies.get(COOKIE)
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        assert client.cookies.get(COOKIE) != first
        assert len(session_rows(db)) == 1
        client.cookies.clear()
        assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={first}"}).status_code == 401

    def test_login_cleans_up_expired_sessions(self, client, db, logged_in):
        db.execute(text("UPDATE sessions SET created_at = :c, expires_at = :e"), {"c": utcnow() - timedelta(hours=2), "e": utcnow() - timedelta(hours=1)})
        client.cookies.clear()
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        assert len(session_rows(db)) == 1  # nur die neue

    def test_sessions_of_two_users_are_independent(self, client, db, registered):
        client.post("/api/auth/register", json=user_payload(username="bernd", email="bernd@example.org"))
        client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        anna_token = client.cookies.get(COOKIE)
        client.cookies.clear()
        client.post("/api/auth/login", json={"identifier": "bernd", "password": PASSWORD})
        assert client.get("/api/auth/me").json()["user"]["username"] == "bernd"
        client.cookies.clear()
        assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={anna_token}"}).json()["user"]["username"] == "anna.beispiel"


# ============================================================ /api/auth/me
class TestMe:
    def test_without_session(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401
        assert r.json() == {"detail": "Nicht angemeldet."}

    def test_with_valid_session(self, logged_in):
        client, csrf, _ = logged_in
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == "anna@example.org"
        assert body["csrf_token"] == csrf
        assert set(body["user"]) == {"id", "username", "first_name", "last_name", "email", "email_verified"}
        assert r.headers["cache-control"] == "no-store"
        assert "password" not in r.text and "argon2" not in r.text and "vault_key" not in r.text and "kdf" not in r.text

    def test_invalid_cookie_is_rejected_and_cleared(self, client):
        r = client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}=" + "x" * 43})
        assert r.status_code == 401
        assert parse_cookie(r)["max-age"] == "0"

    @pytest.mark.parametrize("value", ["", "a", "ä" * 50, "A" * 5000])
    def test_garbage_cookie_values(self, client, value):
        # als Bytes senden, damit auch Nicht-ASCII-Werte beim Server ankommen
        assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={value}".encode("utf-8")}).status_code == 401

    def test_non_ascii_variant_of_valid_token_is_rejected(self, logged_in):
        client, _, token = logged_in
        client.cookies.clear()
        r = client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={token}ä".encode("utf-8")})
        assert r.status_code == 401

    def test_expired_session_rejected_and_deleted(self, logged_in, db):
        client, _, _ = logged_in
        db.execute(text("UPDATE sessions SET created_at = :c, expires_at = :e, last_activity = :n"), {"c": utcnow() - timedelta(hours=9), "e": utcnow() - timedelta(seconds=1), "n": utcnow()})
        r = client.get("/api/auth/me")
        assert r.status_code == 401
        assert parse_cookie(r)["max-age"] == "0"
        assert session_rows(db) == []

    def test_session_expiring_in_future_is_valid(self, logged_in, db):
        client, _, _ = logged_in
        db.execute(text("UPDATE sessions SET expires_at = :e"), {"e": utcnow() + timedelta(minutes=5)})
        assert client.get("/api/auth/me").status_code == 200

    def test_idle_timeout(self, logged_in, db, monkeypatch):
        client, _, _ = logged_in
        later = utcnow() + timedelta(minutes=settings.session_idle_timeout_minutes + 1)
        monkeypatch.setattr("app.api.deps.utcnow", lambda: later)
        r = client.get("/api/auth/me")
        assert r.status_code == 401
        assert session_rows(db) == []

    def test_activity_within_idle_timeout_extends_activity_but_not_expiry(self, logged_in, db, monkeypatch):
        client, _, _ = logged_in
        before = session_rows(db)[0]
        t1 = utcnow() + timedelta(minutes=20)
        monkeypatch.setattr("app.api.deps.utcnow", lambda: t1)
        assert client.get("/api/auth/me").status_code == 200
        after = session_rows(db)[0]
        assert after["last_activity"] >= before["last_activity"] + timedelta(minutes=19)
        assert after["expires_at"] == before["expires_at"]  # feste Ablaufzeit

    def test_absolute_expiry_cannot_be_extended_by_activity(self, logged_in, db, monkeypatch):
        client, _, _ = logged_in
        monkeypatch.setattr(settings, "session_idle_timeout_minutes", 100000)
        later = utcnow() + timedelta(minutes=settings.session_lifetime_minutes + 1)
        monkeypatch.setattr("app.api.deps.utcnow", lambda: later)
        assert client.get("/api/auth/me").status_code == 401

    def test_blocked_account_loses_access(self, logged_in, db):
        client, _, _ = logged_in
        db.execute(text("UPDATE users SET account_status = 'locked'"))
        assert client.get("/api/auth/me").status_code == 401

    def test_deleted_user_invalidates_session(self, logged_in, db):
        client, _, _ = logged_in
        db.execute(text("DELETE FROM users"))
        assert client.get("/api/auth/me").status_code == 401


# ============================================================ Logout
class TestLogout:
    def test_logout_deletes_session_and_cookie(self, logged_in, db):
        client, csrf, token = logged_in
        r = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 204
        assert parse_cookie(r)["max-age"] == "0"
        assert session_rows(db) == []
        assert client.get("/api/auth/me").status_code == 401

    def test_old_token_is_invalid_after_logout(self, logged_in):
        client, csrf, token = logged_in
        client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
        client.cookies.clear()
        assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={token}"}).status_code == 401

    def test_logout_requires_csrf_token(self, logged_in, db):
        client, _, _ = logged_in
        r = client.post("/api/auth/logout")
        assert r.status_code == 403
        assert len(session_rows(db)) == 1  # Session bleibt bestehen
        assert client.get("/api/auth/me").status_code == 200

    def test_logout_with_wrong_csrf_token(self, logged_in, db):
        client, csrf, _ = logged_in
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": "0" * 64}).status_code == 403
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf[:-1]}).status_code == 403
        assert len(session_rows(db)) == 1

    def test_logout_without_session_is_idempotent(self, client):
        r = client.post("/api/auth/logout")
        assert r.status_code == 204
        assert parse_cookie(r)["max-age"] == "0"

    def test_logout_only_ends_own_session(self, client, db, registered):
        client.post("/api/auth/register", json=user_payload(username="bernd", email="bernd@example.org"))
        client.post("/api/auth/login", json={"identifier": "bernd", "password": PASSWORD})
        client.cookies.clear()
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD})
        client.post("/api/auth/logout", headers={"X-CSRF-Token": r.json()["csrf_token"]})
        assert len(session_rows(db)) == 1


# ============================================================ CSRF und Origin
class TestCsrf:
    def test_csrf_token_is_bound_to_session(self, client, registered):
        a = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}).json()["csrf_token"]
        client.cookies.clear()
        b = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}).json()["csrf_token"]
        assert a != b
        # Token der ersten Session gilt nicht für die zweite
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": a}).status_code == 403
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": b}).status_code == 204

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_protected_write_routes_require_csrf(self, logged_in, method):
        client, csrf, _ = logged_in
        url = "/api/_test/protected"
        assert client.request(method, url).status_code == 403
        assert client.request(method, url, headers={"X-CSRF-Token": "falsch"}).status_code == 403
        ok = client.request(method, url, headers={"X-CSRF-Token": csrf})
        assert ok.status_code == 200 and ok.json() == {"user": "anna.beispiel"}

    def test_protected_read_route_needs_no_csrf_token(self, logged_in):
        client, _, _ = logged_in
        assert client.get("/api/_test/protected").status_code == 200

    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
    def test_protected_routes_require_authentication(self, client, method):
        assert client.request(method, "/api/_test/protected").status_code == 401

    def test_protected_route_rejects_invalid_session_even_with_csrf_header(self, client):
        r = client.post("/api/_test/protected", headers={"X-CSRF-Token": "x" * 64, "Cookie": f"{COOKIE}=" + "y" * 43})
        assert r.status_code == 401

    @pytest.mark.parametrize("path,body", [("/api/auth/login", {"identifier": "a", "password": "b"}), ("/api/auth/register", user_payload()), ("/api/auth/logout", None)])
    @pytest.mark.parametrize("origin", ["http://evil.example", "https://testserver.evil.example", "null", "http://testserver:9999"])
    def test_foreign_origin_is_rejected(self, client, path, body, origin):
        r = client.post(path, json=body, headers={"Origin": origin})
        assert r.status_code == 403

    def test_foreign_origin_cannot_use_session_even_with_valid_csrf_token(self, logged_in, db):
        client, csrf, _ = logged_in
        r = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": "http://evil.example"})
        assert r.status_code == 403
        assert len(session_rows(db)) == 1

    def test_same_origin_is_allowed(self, client, registered):
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}, headers={"Origin": "http://testserver"})
        assert r.status_code == 200

    def test_configured_cors_origin_is_allowed(self, client, registered):
        origin = settings.cors_origin_list[0]
        r = client.post("/api/auth/login", json={"identifier": "anna@example.org", "password": PASSWORD}, headers={"Origin": origin})
        assert r.status_code == 200

    def test_origin_not_checked_for_safe_methods(self, client):
        assert client.get("/api/health", headers={"Origin": "http://evil.example"}).status_code == 200


# ============================================================ Sicherheitsfunktionen
class TestSecurityHelpers:
    def test_hash_is_argon2id_and_salted(self):
        from app.core.security import hash_password, verify_password

        h1, h2 = hash_password("ein-langes-passwort-1"), hash_password("ein-langes-passwort-1")
        assert h1.startswith("$argon2id$") and h1 != h2
        assert verify_password(h1, "ein-langes-passwort-1")
        assert not verify_password(h1, "ein-langes-passwort-2")
        assert not verify_password("kein-gueltiger-hash", "x")

    def test_unicode_normalization(self):
        from app.core.security import hash_password, verify_password

        h = hash_password("café-passwort-123")  # é als ein Zeichen
        assert verify_password(h, "café-passwort-123")  # e + kombinierender Akzent

    def test_session_token_properties(self):
        from app.core.security import generate_session_token, hash_session_token

        t = generate_session_token()
        assert len(t) >= 43 and generate_session_token() != t
        assert len(hash_session_token(t)) == 32
        assert hash_session_token(t) == hashlib.sha256(t.encode()).digest()
