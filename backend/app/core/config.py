"""Konfiguration über Umgebungsvariablen bzw. die Datei backend/.env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # CORS: erlaubte Frontend-Origins (kommagetrennt)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # MariaDB
    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "pivault"
    db_user: str = ""
    db_password: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
