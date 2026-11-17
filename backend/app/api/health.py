import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_engine

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health() -> JSONResponse:
    """Liveness inkl. Datenbankverbindung.

    200, wenn das Backend läuft und MariaDB antwortet; sonst 503.
    Fehlerdetails werden nur geloggt, nicht an den Client gegeben.
    """
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Datenbank nicht erreichbar")
        return JSONResponse(status_code=503, content={"status": "error", "database": "unavailable"})
    return JSONResponse(content={"status": "ok", "database": "ok"})
