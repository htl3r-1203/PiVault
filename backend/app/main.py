from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, health
from app.api.deps import verify_same_origin
from app.core.config import settings

app = FastAPI(
    title="PiVault API",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    # Schreibende Requests von fremden Websites werden für alle Routen abgewiesen
    dependencies=[Depends(verify_same_origin)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
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


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
