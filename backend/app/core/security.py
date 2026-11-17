"""Sicherheitsfunktionen für Anmeldung und Sessions.

* Login-Passwörter werden ausschließlich mit Argon2id gehasht.
* Das Master-Passwort des Tresors kommt hier nicht vor und erreicht nie das Backend.
* Session-Tokens sind zufällig (32 Byte); in der Datenbank steht nur ihr SHA-256-Hash.
* Das CSRF-Token wird aus dem Session-Token abgeleitet (HMAC), es muss nicht gespeichert werden.
"""

import hashlib
import hmac
import secrets
import threading
import unicodedata
from datetime import UTC, datetime
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import settings

# argon2-cffi: Standardparameter (RFC 9106, "low memory"), Variante Argon2id
_hasher = PasswordHasher()

# Jede Argon2id-Operation belegt 64 MiB. Ohne Begrenzung könnten bis zu 40 Threads des Thread-Pools gleichzeitig
# hashen und das Speicherlimit des Containers sprengen (Messung: 120 parallele Logins ~ 970 MiB von 1 GiB).
# Weitere Anfragen warten, bis ein Platz frei wird.
_hash_slots = threading.BoundedSemaphore(max(1, settings.max_concurrent_password_hashes))

SESSION_TOKEN_BYTES = 32


def utcnow() -> datetime:
    """Aktuelle Zeit als naives UTC-Datum (passt zu den DATETIME-Spalten ohne Zeitzone)."""
    return datetime.now(UTC).replace(tzinfo=None)


def _normalize(password: str) -> bytes:
    # Unicode-Normalisierung, damit dasselbe Passwort auf verschiedenen Geräten gleich hasht
    return unicodedata.normalize("NFKC", password).encode("utf-8")


def hash_password(password: str) -> str:
    with _hash_slots:
        return _hasher.hash(_normalize(password))


def _verify(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, _normalize(password))
    except (VerificationError, InvalidHashError):
        return False


def verify_password(password_hash: str, password: str) -> bool:
    with _hash_slots:
        return _verify(password_hash, password)


@lru_cache
def _dummy_hash() -> str:
    return _hasher.hash(b"pivault-dummy-password")


def verify_dummy_password(password: str) -> None:
    """Gleicht die Antwortzeit bei unbekanntem Benutzer an (kein Hinweis, ob ein Konto existiert)."""
    with _hash_slots:
        _verify(_dummy_hash(), password)


def generate_session_token() -> str:
    """Kryptografisch zufälliges Token (32 Byte, URL-sicher kodiert)."""
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def hash_session_token(token: str) -> bytes:
    """SHA-256-Hash des Tokens (32 Byte) - nur dieser Wert wird gespeichert."""
    return hashlib.sha256(token.encode("utf-8")).digest()


def csrf_token_for(session_token: str) -> str:
    """CSRF-Token, gebunden an die Session. Nur wer das (HttpOnly-)Session-Token kennt, kann es berechnen."""
    return hmac.new(session_token.encode("utf-8"), b"pivault-csrf-v1", hashlib.sha256).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
