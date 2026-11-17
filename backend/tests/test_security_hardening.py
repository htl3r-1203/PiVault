"""Regressionstests für die implementierten Sicherheits- und Härtungsmaßnahmen:

- Rate-Limiting für Login und Registrierung (429 Too Many Requests, Retry-After)
- Brute-Force-Schutz & Account Lockout (users.locked_until)
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

    def test_account_lockout_after_consecutive_failed_logins(self, client, db, registered):
        """5 aufeinanderfolgende Fehlversuche sperren das Konto (users.locked_until)."""
        # Wir setzen das IP-Rate-Limit temporär hoch, um das Account-Lockout isoliert zu prüfen
        orig_limit = settings.rate_limit_login_per_minute
        settings.rate_limit_login_per_minute = 100
        try:
            for _ in range(5):
                r = client.post(
                    "/api/auth/login",
                    json={"identifier": registered["email"], "password": "wrong-password"},
                )
                assert r.status_code == 401

            # Prüfe, dass locked_until in der Datenbank gesetzt wurde
            row = db.execute(
                text("SELECT locked_until FROM users WHERE email = :e"),
                {"e": registered["email"]},
            ).mappings().one()
            assert row["locked_until"] is not None
            assert row["locked_until"] > utcnow()

            # Anmeldung mit KORREKTEM Passwort wird nun mit 403 abgewiesen
            r = client.post(
                "/api/auth/login",
                json={"identifier": registered["email"], "password": PASSWORD},
            )
            assert r.status_code == 403
            assert "gesperrt" in r.json()["detail"]
        finally:
            settings.rate_limit_login_per_minute = orig_limit

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
