"""Regressionstests für die implementierten Sicherheits- und Härtungsmaßnahmen:

- Rate-Limiting für Login und Registrierung (429 Too Many Requests, Retry-After)
- Brute-Force-Bremse je (IP, Benutzername) ohne Aussperr-DoS; manuelle Sperre (users.locked_until)
- Request-Body-Größenbegrenzung (413 Payload Too Large)
- HTTP-Sicherheitsheader (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Deaktivierung der OpenAPI-Dokumentation in Produktion
- Trusted-Host-Validierung
- Sichere Passwortverwaltung über Dateien (db_password_file)
"""

from datetime import timedelta
import pytest
from sqlalchemy import text

from app.core.config import Settings, settings
from app.core.rate_limit import rate_limiter
from app.core.security import utcnow
from tests.conftest import PASSWORD, user_payload


class TestRateLimitingAndBruteForce:
    def test_login_rate_limiting_ip(self, client, registered):
        """Nach 5 Login-Versuchen pro Minute liefert die 6. Anfrage HTTP 429."""
        for _ in range(5):
            r = client.post(
                "/api/auth/login",
                json={"identifier": registered["email"], "password": "wrong-password"},
            )
            assert r.status_code == 401

        # 6. Versuch muss durch das IP-Rate-Limit abgelehnt werden
        r = client.post(
            "/api/auth/login",
            json={"identifier": registered["email"], "password": "wrong-password"},
        )
        assert r.status_code == 429
        assert "Zu viele Anmeldeversuche" in r.json()["detail"]
        assert "retry-after" in r.headers

    def test_register_rate_limiting_ip(self, client):
        """Nach 3 Registrierungen pro 5 Minuten liefert die 4. Anfrage HTTP 429."""
        for i in range(3):
            data = user_payload(username=f"user_{i}", email=f"user_{i}@example.org")
            r = client.post("/api/auth/register", json=data)
            assert r.status_code == 201

        # 4. Versuch muss abgelehnt werden
        data = user_payload(username="user_overflow", email="user_overflow@example.org")
        r = client.post("/api/auth/register", json=data)
        assert r.status_code == 429
        assert "Zu viele Registrierungsanfragen" in r.json()["detail"]
        assert "retry-after" in r.headers

    def test_failed_logins_block_only_the_attacking_ip_not_the_account(self, client, db, registered):
        """5 Fehlversuche blockieren nur die Kombination aus IP und Benutzername, nicht das Konto.

        (Früher setzte das users.locked_until: Jeder Fremde konnte damit fremde Konten aussperren.
        Ausführlichere Tests: test_lockout_dos.py)
        """
        # Das allgemeine IP-Limit temporär hoch setzen, um die Fehlversuchs-Bremse isoliert zu prüfen
        orig_limit = settings.rate_limit_login_per_minute
        settings.rate_limit_login_per_minute = 100
        try:
            for _ in range(5):
                r = client.post(
                    "/api/auth/login",
                    json={"identifier": registered["email"], "password": "wrong-password"},
                )
                assert r.status_code == 401

            # Dieselbe IP wird für dieses Konto gebremst (429), auch mit dem richtigen Passwort
            r = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD})
            assert r.status_code == 429
            assert "retry-after" in r.headers

            # Das Konto selbst bleibt unverändert und ist von einer anderen IP aus nutzbar
            assert db.execute(text("SELECT locked_until FROM users")).scalar() is None
            r = client.post(
                "/api/auth/login",
                json={"identifier": registered["email"], "password": PASSWORD},
                headers={"X-Forwarded-For": "198.51.100.7"},
            )
            assert r.status_code == 200
        finally:
            settings.rate_limit_login_per_minute = orig_limit

    def test_manually_locked_account_is_rejected_with_403(self, client, db, registered):
        """Eine manuell gesetzte Sperre (users.locked_until) wird nach korrektem Passwort mit 403 gemeldet."""
        db.execute(text("UPDATE users SET locked_until = :t"), {"t": utcnow() + timedelta(hours=1)})
        r = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD})
        assert r.status_code == 403
        assert "gesperrt" in r.json()["detail"]

    def test_successful_login_resets_failed_attempts(self, client, registered):
        """Erfolgreicher Login setzt den Zähler für Fehlversuche zurück."""
        client.post(
            "/api/auth/login",
            json={"identifier": registered["email"], "password": "wrong-password"},
        )
        # Login mit korrektem Passwort
        r = client.post(
            "/api/auth/login",
            json={"identifier": registered["email"], "password": PASSWORD},
        )
        assert r.status_code == 200


class TestRequestSizeLimit:
    def test_oversized_payload_rejected(self, client):
        """Anfragen, die das Größenlimit überschreiten, werden mit 413 abgewiesen."""
        large_padding = "x" * (settings.max_request_body_bytes + 1024)
        r = client.post(
            "/api/auth/login",
            content=large_padding,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 413
        assert "Anfragekörper überschreitet die maximal erlaubte Größe" in r.json()["detail"]

    def test_streamed_oversized_payload_without_content_length_rejected(self, client):
        """Auch gestreamte Bodys ohne Content-Length (chunked) werden mit 413 statt 400 abgewiesen."""

        def chunks():
            for _ in range(3):
                yield b"x" * (settings.max_request_body_bytes // 2)

        r = client.post("/api/auth/login", content=chunks(), headers={"Content-Type": "application/json"})
        assert r.status_code == 413


class TestUnexpectedErrors:
    def test_unhandled_exception_returns_generic_500_without_internals(self):
        """Unerwartete Fehler geben weder Meldung noch Stacktrace an den Client."""
        from fastapi.testclient import TestClient

        from app.main import app

        @app.get("/api/_test/boom")
        def boom():
            raise RuntimeError("interne-details passwort=hunter2")

        r = TestClient(app, raise_server_exceptions=False).get("/api/_test/boom")
        assert r.status_code == 500
        assert r.json() == {"detail": "Interner Serverfehler."}
        assert "hunter2" not in r.text and "RuntimeError" not in r.text


class TestSecurityHeaders:
    def test_security_headers_present_on_api(self, client):
        """Alle API-Antworten müssen defensive Sicherheitsheader enthalten."""
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.headers.get("x-content-type-options") == "nosniff"
        assert r.headers.get("x-frame-options") == "DENY"
        assert r.headers.get("referrer-policy") == "same-origin"


class TestDocsAndHostValidation:
    def test_docs_endpoints_disabled_in_production(self, client):
        """In Produktion (docs_enabled=False) dürfen /api/docs und /api/openapi.json nicht erreichbar sein."""
        assert settings.docs_enabled is False
        r_docs = client.get("/api/docs")
        assert r_docs.status_code == 404
        r_openapi = client.get("/api/openapi.json")
        assert r_openapi.status_code == 404

    def test_disallowed_host_header_rejected(self, client):
        """Anfragen mit nicht erlaubtem Host-Header werden durch TrustedHostMiddleware mit 400 abgewiesen."""
        r = client.get("/api/health", headers={"Host": "evil-attacker.example.org"})
        assert r.status_code == 400


class TestPasswordFileResolution:
    def test_db_password_file_resolution(self, tmp_path):
        """db_password_file liest das Passwort korrekt aus einer Datei (z. B. Docker Secret)."""
        secret_file = tmp_path / "db_secret.txt"
        secret_file.write_text("super_secure_secret_password\n", encoding="utf-8")

        test_settings = Settings(
            db_password="fallback_password",
            db_password_file=str(secret_file),
        )
        assert test_settings.resolved_db_password == "super_secure_secret_password"

    def test_db_password_fallback_when_file_unset(self):
        test_settings = Settings(
            db_password="standard_env_password",
            db_password_file=None,
        )
        assert test_settings.resolved_db_password == "standard_env_password"


class TestPasswordHashingConcurrency:
    def test_concurrent_argon2_operations_are_limited(self, monkeypatch):
        """Gleichzeitige Hash-Operationen sind begrenzt (jede belegt 64 MiB RAM), weitere warten."""
        import threading
        import time

        from app.core import security

        limit = settings.max_concurrent_password_hashes
        lock = threading.Lock()
        state = {"running": 0, "peak": 0}

        class SlowHasher:
            def verify(self, *_args):
                with lock:
                    state["running"] += 1
                    state["peak"] = max(state["peak"], state["running"])
                time.sleep(0.05)
                with lock:
                    state["running"] -= 1
                return True

        monkeypatch.setattr(security, "_hasher", SlowHasher())
        threads = [threading.Thread(target=security.verify_password, args=("h", "p")) for _ in range(limit * 4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert 1 <= state["peak"] <= limit
