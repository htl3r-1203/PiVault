"""MariaDB-Anbindung über SQLAlchemy.

Die Engine wird erst beim ersten Zugriff erzeugt (lazy). Beim Import wird keine
Verbindung aufgebaut, daher startet das Backend auch ohne laufende Datenbank.
"""

from functools import lru_cache

from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


@lru_cache
def get_engine() -> Engine:
    url = URL.create(
        drivername="mysql+pymysql",
        username=settings.db_user,
        password=settings.resolved_db_password,
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    )
    # Kurzer Verbindungs-Timeout, Pool-Begrenzung gegen Ressourcenerschöpfung auf dem Pi 5
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=1800,
        hide_parameters=True,  # Parameter (E-Mail, Hashes) erscheinen nicht in Fehlermeldungen/Logs
        connect_args={"connect_timeout": 3},
    )


def get_db():
    """FastAPI-Dependency für eine Datenbank-Session."""
    session: Session = sessionmaker(bind=get_engine(), autoflush=False)()
    try:
        yield session
    finally:
        session.close()
