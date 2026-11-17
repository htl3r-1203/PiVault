"""Gemeinsame Abhängigkeiten: Session-Authentifizierung, CSRF- und Origin-Prüfung.

Geschützte Endpunkte verwenden `Depends(get_auth)`. Bei schreibenden Methoden
(POST, PUT, PATCH, DELETE) prüft `get_auth` automatisch auch das CSRF-Token,
neue geschützte Routen sind damit ohne Zusatzaufwand abgesichert.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.security import csrf_token_for, hash_session_token, tokens_equal, utcnow
from app.db.models import Session as UserSession
from app.db.models import User
from app.db.session import get_db

COOKIE_NAME = "pivault_session"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
# last_activity wird höchstens einmal pro Minute geschrieben
ACTIVITY_UPDATE_INTERVAL = timedelta(seconds=60)


@dataclass
class AuthContext:
    user: User
    session: UserSession
    token: str  # rohes Session-Token aus dem Cookie (wird nie gespeichert)


# ---------------------------------------------------------------- Cookie
def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_lifetime_minutes * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


def _clear_cookie_header() -> dict[str, str]:
    probe = Response()
    clear_session_cookie(probe)
    return {"Set-Cookie": probe.headers["set-cookie"]}


# ---------------------------------------------------------------- Konto
def user_can_login(user: User, now: datetime) -> bool:
    """Konto muss aktiv und darf nicht (mehr) gesperrt sein."""
    if user.account_status != "active":
        return False
    return user.locked_until is None or user.locked_until <= now


# ---------------------------------------------------------------- Origin / CSRF
def verify_same_origin(request: Request) -> None:
    """Schreibende Requests dürfen nicht von fremden Websites stammen.

    Browser senden bei Cross-Site-POSTs immer einen Origin-Header. Ist er vorhanden,
    muss er zum Host dieser Anfrage (Apache reicht den Host durch) oder zu den
    konfigurierten CORS_ORIGINS passen. Anfragen ohne Origin (curl, Tests) bleiben
    möglich, brauchen für authentifizierte Routen aber weiterhin das CSRF-Token.
    """
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    if origin is None:
        return
    netloc = urlsplit(origin).netloc.lower()
    host = (request.headers.get("host") or "").lower()
    if netloc and (netloc == host or origin.lower() in {o.lower() for o in settings.cors_origin_list}):
        return
    raise HTTPException(status_code=403, detail="Anfrage von nicht erlaubtem Ursprung.")


def _check_csrf(request: Request, token: str) -> None:
    sent = request.headers.get(CSRF_HEADER)
    if not sent or not tokens_equal(sent, csrf_token_for(token)):
        raise HTTPException(status_code=403, detail="Ungültiges oder fehlendes CSRF-Token.")


# ---------------------------------------------------------------- Session
def authenticate(request: Request, db: Session) -> AuthContext:
    """Prüft Cookie, Session (Ablauf, Inaktivität), Konto und - bei schreibenden Requests - das CSRF-Token."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")

    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(UserSession.token_hash == hash_session_token(token))
    )
    unauthorized = HTTPException(status_code=401, detail="Nicht angemeldet.", headers=_clear_cookie_header())
    if session is None:
        raise unauthorized

    now = utcnow()
    idle_limit = session.last_activity + timedelta(minutes=settings.session_idle_timeout_minutes)
    if session.expires_at <= now or idle_limit <= now:
        # abgelaufen oder zu lange inaktiv: serverseitig löschen
        db.delete(session)
        db.commit()
        raise unauthorized
    if not user_can_login(session.user, now):
        raise unauthorized

    if request.method not in SAFE_METHODS:
        _check_csrf(request, token)

    if now - session.last_activity >= ACTIVITY_UPDATE_INTERVAL:
        session.last_activity = now
        db.commit()
    return AuthContext(user=session.user, session=session, token=token)


def get_auth(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    return authenticate(request, db)


def no_store(response: Response) -> None:
    """Antworten der Auth-Endpunkte dürfen nicht zwischengespeichert werden."""
    response.headers["Cache-Control"] = "no-store"
