"""Registrierung, Anmeldung, Abmeldung und aktueller Benutzer.

Hier geht es nur um das Login-Passwort. Das Master-Passwort des Tresors wird nie
an das Backend gesendet, und die master_kdf_*- bzw. vault_key_*-Felder bleiben hier
unberührt (NULL = Tresor noch nicht eingerichtet).
"""

import hashlib
import ipaddress
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    COOKIE_NAME,
    AuthContext,
    authenticate,
    clear_session_cookie,
    get_auth,
    no_store,
    set_session_cookie,
    user_can_login,
)
from app.core.config import settings
from app.core.rate_limit import rate_limiter
from app.core.security import (
    csrf_token_for,
    generate_session_token,
    hash_password,
    hash_session_token,
    utcnow,
    verify_dummy_password,
    verify_password,
)
from app.db.models import Session as UserSession
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginIn, LoginOut, MeOut, RegisterIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(no_store)])

MYSQL_DUPLICATE_ENTRY = 1062


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        email_verified=user.email_verified_at is not None,
    )


def _client_ip(request: Request) -> str:
    # Apache hängt die Client-IP als letzten Eintrag an X-Forwarded-For an; weiter links
    # stehende Einträge kann der Client selbst setzen.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()[:45]
    return (request.client.host if request.client else "unknown")[:45]


def _rate_limit_ip(ip: str) -> str:
    """Schlüssel für Limits: IPv6-Adressen werden auf ihr /64-Präfix zusammengefasst, sonst könnte ein
    Angreifer mit einem eigenen Präfix das Limit durch Adresswechsel umgehen."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return str(addr)


def _failure_key(ip: str, identifier: str) -> str:
    """Schlüssel der Fehlversuchs-Bremse: Client-IP + Benutzername/E-Mail (gehasht, feste Länge)."""
    digest = hashlib.sha256(identifier.strip().lower().encode("utf-8")).hexdigest()[:32]
    return f"login:fail:{_rate_limit_ip(ip)}:{digest}"


@router.post("/register", status_code=201, response_model=UserOut)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)) -> UserOut:
    # Rate-Limiting für Registrierungen nach Client-IP (Schutz vor automatisiertem Account-Spam)
    if settings.rate_limit_enabled:
        client_ip = _client_ip(request)
        allowed, retry_after = rate_limiter.check_rate_limit(
            key=f"register:ip:{_rate_limit_ip(client_ip)}",
            max_requests=settings.rate_limit_register_per_5_minutes,
            window_seconds=300,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Zu viele Registrierungsanfragen. Bitte warten Sie einen Moment.",
                headers={"Retry-After": str(retry_after)},
            )

    # E-Mail wird nicht verifiziert: email_verified_at bleibt NULL.
    user = User(
        username=payload.username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "args", [None])[0] == MYSQL_DUPLICATE_ENTRY:
            # Bewusst nicht verraten, welches der beiden Felder vergeben ist
            raise HTTPException(
                status_code=409, detail="Benutzername oder E-Mail-Adresse ist bereits vergeben."
            ) from None
        raise
    return _user_out(user)


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> LoginOut:
    client_ip = _client_ip(request)
    failure_key = _failure_key(client_ip, payload.identifier)
    failure_window = settings.account_lockout_minutes * 60

    # Rate-Limiting vor der teuren Argon2id-Prüfung (Schutz vor DoS und CPU-Exhaustion auf dem Pi 5)
    if settings.rate_limit_enabled:
        allowed, retry_after = rate_limiter.check_rate_limit(
            key=f"login:ip:{_rate_limit_ip(client_ip)}",
            max_requests=settings.rate_limit_login_per_minute,
            window_seconds=60,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Zu viele Anmeldeversuche. Bitte warten Sie einen Moment.",
                headers={"Retry-After": str(retry_after)},
            )
        # Brute-Force-Bremse je (Client-IP, Benutzername/E-Mail). Bewusst NICHT je Konto: Sonst könnte
        # jeder Fremde mit Fehlversuchen das Konto eines anderen sperren. Die Prüfung erfolgt vor dem
        # Benutzer-Lookup und gilt für existierende und nicht existierende Konten gleich.
        blocked, retry_after = rate_limiter.is_blocked(failure_key, settings.max_failed_logins, failure_window)
        if blocked:
            raise HTTPException(
                status_code=429,
                detail="Zu viele fehlgeschlagene Anmeldeversuche. Bitte später erneut versuchen.",
                headers={"Retry-After": str(retry_after)},
            )

    invalid = HTTPException(status_code=401, detail="E-Mail-Adresse/Benutzername oder Passwort ist falsch.")

    user = db.scalar(
        select(User).where(or_(User.username == payload.identifier, User.email == payload.identifier))
    )
    if user is None:
        verify_dummy_password(payload.password)  # gleiche Antwortzeit wie bei vorhandenem Konto
        rate_limiter.record_event(failure_key, failure_window)
        raise invalid

    if not verify_password(user.password_hash, payload.password):
        # Nur die Fehlversuchs-Bremse dieser (IP, Benutzername)-Kombination zählt; users.locked_until
        # wird hier nie gesetzt (das wäre ein Aussperr-DoS gegen fremde Konten).
        rate_limiter.record_event(failure_key, failure_window)
        raise invalid

    now = utcnow()
    if not user_can_login(user, now):
        # Erst nach korrekt geprüftem Passwort, damit gesperrte Konten nicht auslesbar sind
        raise HTTPException(status_code=403, detail="Anmeldung nicht möglich: Das Konto ist gesperrt oder deaktiviert.")

    # Bei erfolgreicher Authentifizierung die Fehlversuche dieser Kombination zurücksetzen
    rate_limiter.clear(failure_key)

    # Eine zuvor genutzte Session dieses Browsers beenden und abgelaufene Sessions aufräumen
    old_token = request.cookies.get(COOKIE_NAME)
    if old_token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_session_token(old_token)))
    db.execute(delete(UserSession).where(UserSession.expires_at <= now))

    token = generate_session_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            ip_address=_client_ip(request),
            user_agent=(request.headers.get("user-agent") or "unknown")[:512],
            created_at=now,
            expires_at=now + timedelta(minutes=settings.session_lifetime_minutes),
            last_activity=now,
        )
    )
    user.last_login_at = now
    db.commit()

    set_session_cookie(response, token)
    return LoginOut(user=_user_out(user), csrf_token=csrf_token_for(token))


@router.get("/me", response_model=MeOut)
def me(ctx: AuthContext = Depends(get_auth)) -> MeOut:
    return MeOut(user=_user_out(ctx.user), csrf_token=csrf_token_for(ctx.token))


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    try:
        ctx = authenticate(request, db)  # prüft bei gültiger Session auch das CSRF-Token (403 bei Fehler)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        # Keine (gültige) Session: nichts zu löschen, Cookie trotzdem entfernen
        clear_session_cookie(response)
        return response
    db.delete(ctx.session)
    db.commit()
    clear_session_cookie(response)
    return response
