"""Datenbankmodelle (Stand: Relationenmodell, Phase 1 mit vier Tabellen).

Die Quelle der Wahrheit für das Schema ist database/schema.sql; diese Modelle
müssen dazu passen (Spaltennamen, Typen, Constraints).

Zero-Knowledge: Vault-Inhalte werden ausschließlich als verschlüsselte Binärdaten
gespeichert. Ver- und Entschlüsselung sowie die Schlüsselableitung aus dem
Master-Passwort findet im Client statt. Das Login-Passwort (users.password_hash)
und das Master-Passwort sind vollständig getrennt.
Nicht enthalten (bewusst, spätere Erweiterung): folders, devices, audit_logs.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    VARBINARY,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.mysql import INTEGER, MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# INT UNSIGNED AUTO_INCREMENT (beginnt bei 1)
UIntPK = INTEGER(unsigned=True)
UInt = INTEGER(unsigned=True)

_NOW = text("CURRENT_TIMESTAMP")
_NOW_ON_UPDATE = text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

# Löschen über ORM und Datenbank:
# "all, delete-orphan" löscht bereits geladene Kinder explizit (statt ihren
# Fremdschlüssel auf NULL zu setzen). passive_deletes=True überlässt nicht geladene
# Kinder dem ON DELETE CASCADE der Datenbank, ohne sie vorher zu laden.
_CASCADE = {"cascade": "all, delete-orphan", "passive_deletes": True}


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "master_kdf_salt IS NULL OR LENGTH(master_kdf_salt) BETWEEN 16 AND 32",
            name="kdf_salt_len",
        ),
        CheckConstraint(
            "master_kdf_params IS NULL OR (JSON_TYPE(master_kdf_params) = 'OBJECT' "
            "AND COALESCE(JSON_VALUE(master_kdf_params, '$.v'), '') REGEXP '^[1-9][0-9]*$')",
            name="kdf_params_format",
        ),
        CheckConstraint("encrypted_vault_key IS NULL OR LENGTH(encrypted_vault_key) = 32", name="vault_key_len"),
        CheckConstraint("vault_key_nonce IS NULL OR LENGTH(vault_key_nonce) = 12", name="vault_key_nonce_len"),
        CheckConstraint("vault_key_tag IS NULL OR LENGTH(vault_key_tag) = 16", name="vault_key_tag_len"),
        CheckConstraint(
            "(master_kdf_salt IS NULL AND master_kdf_params IS NULL AND encrypted_vault_key IS NULL "
            "AND vault_key_nonce IS NULL AND vault_key_tag IS NULL) "
            "OR (master_kdf_salt IS NOT NULL AND master_kdf_params IS NOT NULL AND encrypted_vault_key IS NOT NULL "
            "AND vault_key_nonce IS NOT NULL AND vault_key_tag IS NOT NULL)",
            name="vault_key_complete",
        ),
    )

    id: Mapped[int] = mapped_column("PK_User_ID", UIntPK, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # Login-Passwort (Argon2id-Hash, serverseitig). Unabhängig vom Master-Passwort.
    password_hash: Mapped[str] = mapped_column(String(255))
    # Key-Wrapping: Tresorschlüssel, verschlüsselt mit einem aus dem Master-Passwort
    # abgeleiteten Schlüssel. Alle fünf Felder sind NULL (Tresor nicht eingerichtet)
    # oder alle gesetzt. Das Master-Passwort selbst wird nie gespeichert.
    master_kdf_salt: Mapped[bytes | None] = mapped_column(VARBINARY(32))
    # Versioniertes JSON, z. B. {"v":1,"alg":"argon2id","m":65536,"t":3,"p":1,"len":32}
    master_kdf_params: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    encrypted_vault_key: Mapped[bytes | None] = mapped_column(VARBINARY(32))
    vault_key_nonce: Mapped[bytes | None] = mapped_column(VARBINARY(12))
    vault_key_tag: Mapped[bytes | None] = mapped_column(VARBINARY(16))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    account_status: Mapped[str] = mapped_column(String(20), server_default="active")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW_ON_UPDATE)

    vaults: Mapped[list["Vault"]] = relationship(back_populates="user", **_CASCADE)
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", **_CASCADE)


class Vault(Base):
    __tablename__ = "vaults"
    __table_args__ = (
        CheckConstraint("LENGTH(name_nonce) = 12", name="name_nonce_len"),
        CheckConstraint("LENGTH(name_tag) = 16", name="name_tag_len"),
        CheckConstraint("description_nonce IS NULL OR LENGTH(description_nonce) = 12", name="desc_nonce_len"),
        CheckConstraint("description_tag IS NULL OR LENGTH(description_tag) = 16", name="desc_tag_len"),
        CheckConstraint("LENGTH(encrypted_name) > 0", name="name_not_empty"),
        # Beschreibung, Nonce und Tag gehören zusammen: alle NULL oder alle gesetzt
        CheckConstraint(
            "(encrypted_description IS NULL AND description_nonce IS NULL AND description_tag IS NULL) "
            "OR (encrypted_description IS NOT NULL AND description_nonce IS NOT NULL AND description_tag IS NOT NULL)",
            name="desc_complete",
        ),
    )

    id: Mapped[int] = mapped_column("PK_Vault_ID", UIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        "FK_user_id", UInt, ForeignKey("users.PK_User_ID", ondelete="CASCADE"), index=True
    )
    encrypted_name: Mapped[bytes] = mapped_column(VARBINARY(1024))
    name_nonce: Mapped[bytes] = mapped_column(VARBINARY(12))
    name_tag: Mapped[bytes] = mapped_column(VARBINARY(16))
    encrypted_description: Mapped[bytes | None] = mapped_column(VARBINARY(4096))
    description_nonce: Mapped[bytes | None] = mapped_column(VARBINARY(12))
    description_tag: Mapped[bytes | None] = mapped_column(VARBINARY(16))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW_ON_UPDATE)

    user: Mapped[User] = relationship(back_populates="vaults")
    entries: Mapped[list["VaultEntry"]] = relationship(back_populates="vault", **_CASCADE)


class VaultEntry(Base):
    __tablename__ = "vault_entries"
    __table_args__ = (
        CheckConstraint("LENGTH(nonce) = 12", name="nonce_len"),
        CheckConstraint("LENGTH(auth_tag) = 16", name="auth_tag_len"),
        CheckConstraint("LENGTH(encrypted_data) > 0", name="data_not_empty"),
    )

    id: Mapped[int] = mapped_column("PK_VaultEntry_ID", UIntPK, primary_key=True, autoincrement=True)
    vault_id: Mapped[int] = mapped_column(
        "FK_vault_id", UInt, ForeignKey("vaults.PK_Vault_ID", ondelete="CASCADE"), index=True
    )
    encrypted_data: Mapped[bytes] = mapped_column(MEDIUMBLOB)
    nonce: Mapped[bytes] = mapped_column(VARBINARY(12))
    auth_tag: Mapped[bytes] = mapped_column(VARBINARY(16))
    is_favorite: Mapped[bool | None] = mapped_column(Boolean)
    sort_order: Mapped[int | None] = mapped_column(Integer)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW_ON_UPDATE)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    vault: Mapped[Vault] = relationship(back_populates="entries")


class Session(Base):
    """Serverseitige Sitzung.

    Der geheime Session-Token wird nur an den Client gegeben; gespeichert wird
    ausschließlich sein SHA-256-Hash (token_hash). PK_Session_ID ist nur ein interner
    Schlüssel und darf nie als Token verwendet werden. Abmeldung/Widerruf = Zeile löschen.
    Die frühere Spalte "payload" entfällt (keine Sitzungsdaten nötig).
    """

    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("LENGTH(token_hash) = 32", name="token_hash_len"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
    )

    id: Mapped[int] = mapped_column("PK_Session_ID", UIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        "FK_user_id", UInt, ForeignKey("users.PK_User_ID", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[bytes] = mapped_column(VARBINARY(32), unique=True)  # SHA-256, 32 Byte
    ip_address: Mapped[str] = mapped_column(String(45))  # IPv4 oder IPv6
    user_agent: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # feste Ablaufzeit
    last_activity: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW, index=True)

    user: Mapped[User] = relationship(back_populates="sessions")
