from sqlalchemy.exc import OperationalError


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_health_reports_database_failure(client, monkeypatch):
    def broken():
        raise OperationalError("SELECT 1", {}, Exception("DB down"))

    monkeypatch.setattr("app.api.health.get_engine", broken)
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json() == {"status": "error", "database": "unavailable"}
