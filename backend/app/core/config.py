"""Konfiguration über Umgebungsvariablen bzw. die Datei backend/.env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # CORS: erlaubte Frontend-Origins (kommagetrennt)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"

    # MariaDB
    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "pivault"
    db_user: str = ""
    db_password: str = ""
    db_password_file: str | None = None

    # Sessions: Cookie-Flag Secure (für HTTPS auf true setzen, lokal über HTTP false)
    cookie_secure: bool = False
    # Absolute Lebensdauer einer Session (expires_at) und Inaktivitäts-Timeout, in Minuten
    session_lifetime_minutes: int = 480
    session_idle_timeout_minutes: int = 30

    # API-Dokumentation (/api/docs, /api/redoc, /api/openapi.json in Produktion standardmäßig deaktiviert)
    docs_enabled: bool = False

    # Erlaubte Host-Header (Schutz vor Host-Header-Injection)
    allowed_hosts: str = "localhost,127.0.0.1,testserver,backend,frontend,pivault"

    # Rate-Limiting und Brute-Force-Schutz
    rate_limit_enabled: bool = True
    rate_limit_login_per_minute: int = 5
    rate_limit_register_per_5_minutes: int = 3
    max_failed_logins: int = 5
    account_lockout_minutes: int = 15

    # Request-Größenbegrenzung (Schutz vor DoS durch riesige Payloads; 1 MB Standard)
    max_request_body_bytes: int = 1_048_576

    @property
    def resolved_db_password(self) -> str:
        """Liest das Passwort aus einer Datei (z. B. Docker Secrets), falls konfiguriert."""
        if self.db_password_file:
            path = Path(self.db_password_file)
            if path.is_file():
                return path.read_text(encoding="utf-8").strip()
        return self.db_password

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]


settings = Settings()
