"""Test-Setup: echte MariaDB (Schema aus database/schema.sql), kein Mocking der Datenbank.

SICHERHEIT: Die Tests löschen Benutzer. Sie laufen deshalb nur gegen die Datenbank
`pivault_test` und brechen sonst sofort ab (nie gegen die Entwicklungsdatenbank).
"""

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings

if settings.db_name != "pivault_test":
    pytest.exit(
        f"Abbruch: Tests dürfen nur gegen die Datenbank 'pivault_test' laufen (konfiguriert: '{settings.db_name}').",
        returncode=2,
    )

from app.api.deps import AuthContext, get_auth  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "correct horse battery staple"

# Geschützte Beispielroute für alle HTTP-Methoden (nur in Tests registriert)
_test_router = APIRouter()


@_test_router.api_route("/api/_test/protected", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def _protected(ctx: AuthContext = Depends(get_auth)) -> dict[str, str]:
    return {"user": ctx.user.username}


app.include_router(_test_router)


@pytest.fixture(autouse=True)
def clean_db():
    with get_engine().connect() as conn:
        conn.execute(text("DELETE FROM users"))  # sessions werden per ON DELETE CASCADE mitgelöscht
        conn.commit()
    yield


@pytest.fixture
def db():
    """Direkter, sofort committender DB-Zugriff für Prüfungen und Zeitmanipulation."""
    with get_engine().connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        yield conn


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def user_payload(**overrides):
    data = {
        "username": "anna.beispiel",
        "first_name": "Anna",
        "last_name": "Beispiel",
        "email": "anna@example.org",
        "password": PASSWORD,
    }
    data.update(overrides)
    return data


@pytest.fixture
def registered(client):
    """Registrierter Benutzer (ohne Anmeldung)."""
    r = client.post("/api/auth/register", json=user_payload())
    assert r.status_code == 201, r.text
    return user_payload()


@pytest.fixture
def logged_in(client, registered):
    """Angemeldeter Client: liefert (client, csrf_token, session_token)."""
    r = client.post("/api/auth/login", json={"identifier": registered["email"], "password": PASSWORD})
    assert r.status_code == 200, r.text
    return client, r.json()["csrf_token"], client.cookies.get("pivault_session")
