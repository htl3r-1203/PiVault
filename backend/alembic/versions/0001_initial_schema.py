"""Initiales Schema: users, vaults, vault_entries, sessions

Revision ID: 0001
Revises:
Create Date: 2026-11-10
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

UINT = mysql.INTEGER(unsigned=True)
NOW = sa.text("CURRENT_TIMESTAMP")
NOW_ON_UPDATE = sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("PK_User_ID", UINT, autoincrement=True, nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(), nullable=True),
        sa.Column("account_status", sa.String(20), server_default="active", nullable=False),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=NOW_ON_UPDATE, nullable=False),
        sa.PrimaryKeyConstraint("PK_User_ID", name=op.f("pk_users")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        mysql_engine="InnoDB",
    )

    op.create_table(
        "vaults",
        sa.Column("PK_Vault_ID", UINT, autoincrement=True, nullable=False),
        sa.Column("FK_user_id", UINT, nullable=False),
        sa.Column("encrypted_name", sa.VARBINARY(1024), nullable=False),
        sa.Column("name_nonce", sa.VARBINARY(12), nullable=False),
        sa.Column("name_tag", sa.VARBINARY(16), nullable=False),
        sa.Column("encrypted_description", sa.VARBINARY(4096), nullable=True),
        sa.Column("description_nonce", sa.VARBINARY(12), nullable=True),
        sa.Column("description_tag", sa.VARBINARY(16), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=NOW_ON_UPDATE, nullable=False),
        sa.PrimaryKeyConstraint("PK_Vault_ID", name=op.f("pk_vaults")),
        sa.ForeignKeyConstraint(
            ["FK_user_id"], ["users.PK_User_ID"],
            name=op.f("fk_vaults_FK_user_id_users"), ondelete="CASCADE",
        ),
        sa.CheckConstraint("LENGTH(name_nonce) = 12", name=op.f("ck_vaults_name_nonce_len")),
        sa.CheckConstraint("LENGTH(name_tag) = 16", name=op.f("ck_vaults_name_tag_len")),
        sa.CheckConstraint(
            "description_nonce IS NULL OR LENGTH(description_nonce) = 12",
            name=op.f("ck_vaults_desc_nonce_len"),
        ),
        sa.CheckConstraint(
            "description_tag IS NULL OR LENGTH(description_tag) = 16",
            name=op.f("ck_vaults_desc_tag_len"),
        ),
        mysql_engine="InnoDB",
    )
    op.create_index(op.f("ix_vaults_FK_user_id"), "vaults", ["FK_user_id"])

    op.create_table(
        "vault_entries",
        sa.Column("PK_VaultEntry_ID", UINT, autoincrement=True, nullable=False),
        sa.Column("FK_vault_id", UINT, nullable=False),
        sa.Column("encrypted_data", mysql.MEDIUMBLOB(), nullable=False),
        sa.Column("nonce", sa.VARBINARY(12), nullable=False),
        sa.Column("auth_tag", sa.VARBINARY(16), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("last_accessed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=NOW_ON_UPDATE, nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("PK_VaultEntry_ID", name=op.f("pk_vault_entries")),
        sa.ForeignKeyConstraint(
            ["FK_vault_id"], ["vaults.PK_Vault_ID"],
            name=op.f("fk_vault_entries_FK_vault_id_vaults"), ondelete="CASCADE",
        ),
        sa.CheckConstraint("LENGTH(nonce) = 12", name=op.f("ck_vault_entries_nonce_len")),
        sa.CheckConstraint("LENGTH(auth_tag) = 16", name=op.f("ck_vault_entries_auth_tag_len")),
        mysql_engine="InnoDB",
    )
    op.create_index(op.f("ix_vault_entries_FK_vault_id"), "vault_entries", ["FK_vault_id"])

    op.create_table(
        "sessions",
        sa.Column("PK_Session_ID", UINT, autoincrement=True, nullable=False),
        sa.Column("FK_user_id", UINT, nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("user_agent", sa.String(512), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("last_activity", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("PK_Session_ID", name=op.f("pk_sessions")),
        sa.ForeignKeyConstraint(
            ["FK_user_id"], ["users.PK_User_ID"],
            name=op.f("fk_sessions_FK_user_id_users"), ondelete="CASCADE",
        ),
        mysql_engine="InnoDB",
    )
    op.create_index(op.f("ix_sessions_FK_user_id"), "sessions", ["FK_user_id"])
    op.create_index(op.f("ix_sessions_last_activity"), "sessions", ["last_activity"])


def downgrade() -> None:
    op.drop_table("sessions")
    op.drop_table("vault_entries")
    op.drop_table("vaults")
    op.drop_table("users")
