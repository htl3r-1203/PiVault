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
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    )
    return create_engine(url, pool_pre_ping=True)


def get_db():
    """FastAPI-Dependency für eine Datenbank-Session (noch von keinem Endpunkt genutzt)."""
    session: Session = sessionmaker(bind=get_engine(), autoflush=False)()
    try:
        yield session
    finally:
        session.close()
