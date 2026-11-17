"""Pydantic-Schemas für Registrierung und Anmeldung.

Das hier ist das Login-Passwort. Das Master-Passwort des Tresors ist etwas anderes
und wird nie an das Backend gesendet.
"""

import re
import unicodedata

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, field_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$")
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128


def _has_control_chars(value: str) -> bool:
    return any(unicodedata.category(ch) == "Cc" for ch in value)


class _Strict(BaseModel):
    # Unbekannte Felder abweisen, damit nichts unbemerkt ignoriert wird
    model_config = ConfigDict(extra="forbid")


class RegisterIn(_Strict):
    username: str
    first_name: str
    last_name: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip()
        if not USERNAME_RE.fullmatch(v):
            raise ValueError(
                "Der Benutzername muss 3 bis 50 Zeichen lang sein, mit Buchstabe oder Ziffer beginnen "
                "und darf nur Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten."
            )
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 100 or _has_control_chars(v):
            raise ValueError("Bitte einen Namen mit 1 bis 100 Zeichen angeben.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if len(v) > 254:
            raise ValueError("Ungültige E-Mail-Adresse.")
        try:
            return validate_email(v, check_deliverability=False).normalized.lower()
        except EmailNotValidError:
            raise ValueError("Ungültige E-Mail-Adresse.") from None

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not PASSWORD_MIN_LENGTH <= len(v) <= PASSWORD_MAX_LENGTH:
            raise ValueError(
                f"Das Passwort muss zwischen {PASSWORD_MIN_LENGTH} und {PASSWORD_MAX_LENGTH} Zeichen lang sein."
            )
        if _has_control_chars(v):
            raise ValueError("Das Passwort enthält ungültige Zeichen.")
        return v


class LoginIn(_Strict):
    identifier: str  # E-Mail-Adresse oder Benutzername
    password: str

    @field_validator("identifier")
    @classmethod
    def _identifier(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("Bitte E-Mail-Adresse oder Benutzernamen angeben.")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not 1 <= len(v) <= PASSWORD_MAX_LENGTH:
            raise ValueError("Bitte das Passwort angeben.")
        return v


class UserOut(BaseModel):
    """Öffentliche Benutzerdaten. Enthält weder Passwort-Hash noch Schlüsselfelder."""

    id: int
    username: str
    first_name: str
    last_name: str
    email: str
    email_verified: bool


class LoginOut(BaseModel):
    user: UserOut
    # Wird als Header X-CSRF-Token bei schreibenden Requests mitgesendet
    csrf_token: str


class MeOut(LoginOut):
    pass
