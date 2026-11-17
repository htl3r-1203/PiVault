"""Schutz vor Lockout-DoS: Ein Angreifer darf fremde Konten nicht aussperren.

Die Brute-Force-Bremse gilt je Kombination aus Client-IP und Benutzername/E-Mail.
Fehlversuche einer fremden IP sperren das Konto nicht und beenden keine Sessions.
Client-IPs werden in den Tests über X-Forwarded-For simuliert (Apache hängt die echte
Client-IP als letzten Eintrag an).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings
from app.core.rate_limit import RateLimiter, rate_limiter
from app.main import app
from tests.conftest import PASSWORD

ATTACKER = {"X-Forwarded-For": "203.0.113.50"}
OWNER = {"X-Forwarded-For": "198.51.100.7"}


def wrong(identifier, headers):
    return TestClient(app).post(
        "/api/auth/login", json={"identifier": identifier, "password": "falsches-passwort-123"}, headers=headers
    )


@pytest.fixture(autouse=True)
def high_ip_limit(monkeypatch):
    """Das allgemeine IP-Limit (5/min) würde die Tests verdecken; hier wird die Fehlversuchs-Bremse isoliert geprüft."""
    monkeypatch.setattr(settings, "rate_limit_login_per_minute", 1000)


class TestAttackerCannotLockOutOwner:
    def test_failed_logins_from_other_ip_do_not_block_owner(self, client, db, registered):
        for _ in range(20):
            assert wrong(registered["email"], ATTACKER).status_code in (401, 429)
        r = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD}, headers=OWNER)
        assert r.status_code == 200
        assert db.execute(text("SELECT locked_until FROM users")).scalar() is None

    def test_failed_logins_do_not_end_existing_session(self, logged_in):
        client, _, _ = logged_in
        for _ in range(20):
            wrong("anna@example.org", ATTACKER)
        assert client.get("/api/auth/me").status_code == 200

    def test_failed_logins_never_set_locked_until(self, db, registered):
        for _ in range(20):
            wrong(registered["email"], ATTACKER)
        assert db.execute(text("SELECT locked_until FROM users")).scalar() is None

    def test_manual_lock_is_not_extended_by_failed_logins(self, db, registered):
        db.execute(text("UPDATE users SET locked_until = '2099-01-01 00:00:00'"))
        for _ in range(10):
            wrong(registered["email"], ATTACKER)
        assert str(db.execute(text("SELECT locked_until FROM users")).scalar()) == "2099-01-01 00:00:00"


class TestBruteForceBrake:
    def test_same_ip_and_identifier_is_blocked_after_max_failures(self, client, registered):
        for _ in range(settings.max_failed_logins):
            assert wrong(registered["email"], ATTACKER).status_code == 401
        blocked = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD}, headers=ATTACKER)
        assert blocked.status_code == 429  # auch das richtige Passwort wird von dieser IP nicht mehr geprüft
        assert int(blocked.headers["retry-after"]) >= 1

    def test_block_applies_to_identifier_variants_of_same_text(self, client, registered):
        for _ in range(settings.max_failed_logins):
            wrong("ANNA@example.org", ATTACKER)
        assert wrong("anna@example.org ", ATTACKER).status_code == 429

    def test_unknown_identifier_behaves_identically(self, registered):
        """Kein Hinweis darauf, ob ein Konto existiert."""
        codes_known = [wrong(registered["email"], ATTACKER).status_code for _ in range(settings.max_failed_logins + 1)]
        codes_unknown = [wrong("gibts-nicht@example.org", ATTACKER).status_code for _ in range(settings.max_failed_logins + 1)]
        assert codes_known == codes_unknown == [401] * settings.max_failed_logins + [429]

    def test_successful_login_resets_counter(self, client, registered):
        for _ in range(settings.max_failed_logins - 1):
            wrong(registered["email"], OWNER)
        assert client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD}, headers=OWNER).status_code == 200
        for _ in range(settings.max_failed_logins - 1):
            assert wrong(registered["email"], OWNER).status_code == 401  # Zähler begann von vorn

    def test_block_expires_after_window(self, client, registered):
        now = [1000.0]
        rate_limiter._clock = lambda: now[0]
        try:
            for _ in range(settings.max_failed_logins):
                wrong(registered["email"], ATTACKER)
            assert wrong(registered["email"], ATTACKER).status_code == 429
            now[0] += settings.account_lockout_minutes * 60 + 1
            r = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD}, headers=ATTACKER)
            assert r.status_code == 200
        finally:
            rate_limiter._clock = __import__("time").monotonic

    def test_old_failures_do_not_accumulate(self, registered):
        now = [1000.0]
        rate_limiter._clock = lambda: now[0]
        try:
            for _ in range(settings.max_failed_logins - 1):
                wrong(registered["email"], ATTACKER)
                now[0] += settings.account_lockout_minutes * 60 / 2 + 1  # jeder Fehlversuch liegt außerhalb des Fensters der übernächsten
            assert wrong(registered["email"], ATTACKER).status_code == 401
        finally:
            rate_limiter._clock = __import__("time").monotonic

    def test_other_account_from_same_ip_is_not_blocked(self, client, registered):
        client.post("/api/auth/register", json={"username": "bernd", "first_name": "B", "last_name": "B", "email": "bernd@example.org", "password": PASSWORD})
        for _ in range(settings.max_failed_logins):
            wrong(registered["email"], ATTACKER)
        r = client.post("/api/auth/login", json={"identifier": "bernd", "password": PASSWORD}, headers=ATTACKER)
        assert r.status_code == 200


class TestClientIpNormalization:
    def test_ipv6_addresses_in_same_64_share_limits(self, registered):
        """Ein Angreifer mit einem /64-Präfix darf das Limit nicht durch Adresswechsel umgehen."""
        for i in range(settings.max_failed_logins):
            wrong(registered["email"], {"X-Forwarded-For": f"2001:db8:abcd:12::{i + 1}"})
        assert wrong(registered["email"], {"X-Forwarded-For": "2001:db8:abcd:12:ffff::9"}).status_code == 429

    def test_different_ipv6_prefixes_are_independent(self, registered):
        for i in range(settings.max_failed_logins):
            wrong(registered["email"], {"X-Forwarded-For": f"2001:db8:abcd:12::{i + 1}"})
        assert wrong(registered["email"], {"X-Forwarded-For": "2001:db8:abcd:99::1"}).status_code == 401

    def test_forged_leading_forwarded_for_entries_are_ignored(self, registered):
        """Der Client kann vorangestellte X-Forwarded-For-Einträge fälschen; maßgeblich ist der letzte (von Apache)."""
        for i in range(settings.max_failed_logins):
            wrong(registered["email"], {"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.50"})
        assert wrong(registered["email"], {"X-Forwarded-For": "10.9.9.9, 203.0.113.50"}).status_code == 429


class TestRateLimiterMemory:
    def test_idle_keys_are_pruned(self):
        now = [0.0]
        limiter = RateLimiter(clock=lambda: now[0])
        for i in range(1000):
            limiter.check_rate_limit(f"login:ip:{i}", max_requests=5, window_seconds=60)
        assert limiter.size() == 1000
        now[0] += 3600
        for i in range(RateLimiter.PRUNE_EVERY + 1):  # löst die periodische Bereinigung aus
            limiter.check_rate_limit("other", max_requests=1000, window_seconds=60)
        assert limiter.size() <= 2
