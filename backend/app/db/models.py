"""Datenbankmodelle (Stand: Relationenmodell, Phase 1 mit vier Tabellen).

Zero-Knowledge: Vault-Inhalte werden ausschließlich als verschlüsselte Binärdaten
gespeichert. Ver- und Entschlüsselung findet im Client statt.
Nicht enthalten (bewusst, spätere Erweiterung): folders, devices, audit_logs.
"""

from datetime import datetime

from sqlalchemy import (
    VARBINARY,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
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


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column("PK_User_ID", UIntPK, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))  # z. B. Argon2id-Hash
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    account_status: Mapped[str] = mapped_column(String(20), server_default="active")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=_NOW_ON_UPDATE)

    vaults: Mapped[list["Vault"]] = relationship(back_populates="user", passive_deletes=True)
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", passive_deletes=True)


class Vault(Base):
    __tablename__ = "vaults"
    __table_args__ = (
        CheckConstraint("LENGTH(name_nonce) = 12", name="name_nonce_len"),
        CheckConstraint("LENGTH(name_tag) = 16", name="name_tag_len"),
        CheckConstraint("description_nonce IS NULL OR LENGTH(description_nonce) = 12", name="desc_nonce_len"),
        CheckConstraint("description_tag IS NULL OR LENGTH(description_tag) = 16", name="desc_tag_len"),
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
    entries: Mapped[list["VaultEntry"]] = relationship(back_populates="vault", passive_deletes=True)


class VaultEntry(Base):
    __tablename__ = "vault_entries"
    __table_args__ = (
        CheckConstraint("LENGTH(nonce) = 12", name="nonce_len"),
        CheckConstraint("LENGTH(auth_tag) = 16", name="auth_tag_len"),
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
    __tablename__ = "sessions"

    # Nur interner Primärschlüssel, kein geheimer Session-Token.
    id: Mapped[int] = mapped_column("PK_Session_ID", UIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        "FK_user_id", UInt, ForeignKey("users.PK_User_ID", ondelete="CASCADE"), index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45))  # IPv4 oder IPv6
    user_agent: Mapped[str] = mapped_column(String(512))
    payload: Mapped[str] = mapped_column(Text)
    last_activity: Mapped[datetime] = mapped_column(DateTime, index=True)

    user: Mapped[User] = relationship(back_populates="sessions")
