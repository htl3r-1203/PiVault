import logging

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api import auth, health
from app.api.deps import verify_same_origin
from app.core.config import settings
from app.core.middleware import ContentSizeLimitMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)

# FastAPI-Instanz: In Produktion keine Debug-Ausgaben und keine öffentliche API-Dokumentation
app = FastAPI(
    title="PiVault API",
    docs_url="/api/docs" if settings.docs_enabled else None,
    redoc_url="/api/redoc" if settings.docs_enabled else None,
    openapi_url="/api/openapi.json" if settings.docs_enabled else None,
    debug=False,
    # Schreibende Requests von fremden Websites werden für alle Routen abgewiesen
    dependencies=[Depends(verify_same_origin)],
)

# 1. Sicherheitsheader auf allen HTTP-Antworten setzen
app.add_middleware(SecurityHeadersMiddleware)

# 2. Begrenzung der Request-Body-Größe gegen DoS (Speichererschöpfung auf dem Pi 5)
app.add_middleware(ContentSizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)

# 3. Host-Header-Validierung (Schutz vor Host-Header-Injection)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_host_list,
)

# 4. CORS-Konfiguration: Least-Privilege mit expliziten Methoden und Headern
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Authorization", "Accept", "Origin"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Validierungsfehler ohne die eingegebenen Werte zurückgeben (z. B. keine Passwörter im Response)."""
    errors = []
    for err in exc.errors():
        field = ".".join(str(part) for part in err["loc"] if part not in ("body", "query", "path")) or None
        if err["type"] == "value_error":
            message = str(err["msg"]).removeprefix("Value error, ")
        elif err["type"] == "extra_forbidden":
            message = "Unbekanntes Feld."
        else:
            message = "Ungültige oder fehlende Eingabe."
        errors.append({"field": field, "message": message})
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Unerwartete Serverfehler sicher behandeln und niemals Stack-Traces oder Interna leaken."""
    logger.exception("Unerwarteter Fehler bei %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Interner Serverfehler."})


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
