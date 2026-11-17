-- PiVault – Änderungsskript 001: Schlüsselverwaltung, sichere Sessions, Constraints
--
-- Bringt eine BESTEHENDE Datenbank (Stand: erste vier Tabellen, ohne Schlüssel-
-- felder und ohne token_hash) auf den Stand von database/schema.sql.
-- Für ein leeres Volume wird dieses Skript NICHT gebraucht (dort läuft schema.sql).
--
-- Eigenschaften:
--   * Keine Tabelle wird gelöscht oder neu erstellt, es gehen keine Zeilen verloren.
--   * Mehrfach ausführbar (IF NOT EXISTS / IF EXISTS).
--   * Nur ALTER TABLE und ein UPDATE auf bereits vorhandenen Session-Zeilen.
--
-- VOR dem Ausführen immer ein Backup anlegen, z. B.:
--   docker compose exec -T database sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' > backup_vor_001.sql
--
-- Ausführen (als root, gegen die Anwendungsdatenbank):
--   docker compose exec -T database sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' < database/migrations/001_auth_keys_sessions.sql
--
-- Hinweise zu vorhandenen Daten:
--   * users: Bestehende Benutzer erhalten für die neuen Schlüsselfelder NULL
--     ("Tresor noch nicht eingerichtet"), das ist laut CHECK-Constraint erlaubt.
--   * sessions: Bisherige Sessions besitzen keinen Token und waren nie nutzbar.
--     Sie bleiben erhalten, bekommen aber einen zufälligen, nicht erratbaren
--     token_hash und gelten sofort als abgelaufen. Die Spalte payload (Klartext, ohne
--     Verwendung) entfällt; ihr Inhalt geht dabei verloren.
--   * Die neuen CHECK-Constraints prüfen auch vorhandene Zeilen. Verletzt eine
--     Zeile einen Constraint, bricht die Anweisung ab und ändert nichts an dieser Tabelle.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- users: Felder für Key-Wrapping (Master-Passwort -> KEK -> Tresorschlüssel)
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS master_kdf_salt     VARBINARY(32) NULL AFTER password_hash,
    ADD COLUMN IF NOT EXISTS master_kdf_params   JSON          NULL AFTER master_kdf_salt,
    ADD COLUMN IF NOT EXISTS encrypted_vault_key VARBINARY(32) NULL AFTER master_kdf_params,
    ADD COLUMN IF NOT EXISTS vault_key_nonce     VARBINARY(12) NULL AFTER encrypted_vault_key,
    ADD COLUMN IF NOT EXISTS vault_key_tag       VARBINARY(16) NULL AFTER vault_key_nonce;

ALTER TABLE users
    ADD CONSTRAINT IF NOT EXISTS ck_users_kdf_salt_len CHECK (master_kdf_salt IS NULL OR LENGTH(master_kdf_salt) BETWEEN 16 AND 32),
    ADD CONSTRAINT IF NOT EXISTS ck_users_kdf_params_format CHECK (master_kdf_params IS NULL OR (JSON_TYPE(master_kdf_params) = 'OBJECT' AND COALESCE(JSON_VALUE(master_kdf_params, '$.v'), '') REGEXP '^[1-9][0-9]*$')),
    ADD CONSTRAINT IF NOT EXISTS ck_users_vault_key_len       CHECK (encrypted_vault_key IS NULL OR LENGTH(encrypted_vault_key) = 32),
    ADD CONSTRAINT IF NOT EXISTS ck_users_vault_key_nonce_len CHECK (vault_key_nonce IS NULL OR LENGTH(vault_key_nonce) = 12),
    ADD CONSTRAINT IF NOT EXISTS ck_users_vault_key_tag_len   CHECK (vault_key_tag IS NULL OR LENGTH(vault_key_tag) = 16),
    ADD CONSTRAINT IF NOT EXISTS ck_users_vault_key_complete CHECK (
        (master_kdf_salt IS NULL AND master_kdf_params IS NULL AND encrypted_vault_key IS NULL AND vault_key_nonce IS NULL AND vault_key_tag IS NULL)
        OR
        (master_kdf_salt IS NOT NULL AND master_kdf_params IS NOT NULL AND encrypted_vault_key IS NOT NULL AND vault_key_nonce IS NOT NULL AND vault_key_tag IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- vaults / vault_entries: zusätzliche Konsistenz-Constraints
-- ---------------------------------------------------------------------------
ALTER TABLE vaults
    ADD CONSTRAINT IF NOT EXISTS ck_vaults_name_not_empty CHECK (LENGTH(encrypted_name) > 0),
    ADD CONSTRAINT IF NOT EXISTS ck_vaults_desc_complete CHECK (
        (encrypted_description IS NULL AND description_nonce IS NULL AND description_tag IS NULL)
        OR
        (encrypted_description IS NOT NULL AND description_nonce IS NOT NULL AND description_tag IS NOT NULL)
    );

ALTER TABLE vault_entries
    ADD CONSTRAINT IF NOT EXISTS ck_vault_entries_data_not_empty CHECK (LENGTH(encrypted_data) > 0);

-- ---------------------------------------------------------------------------
-- sessions: token_hash, created_at, expires_at; payload entfällt
-- ---------------------------------------------------------------------------
-- 1. Neue Spalten zunächst NULL-fähig anlegen, damit vorhandene Zeilen kein Problem sind
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS token_hash VARBINARY(32) NULL AFTER FK_user_id,
    ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER user_agent,
    ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER created_at;

-- 2. Vorhandene (nie nutzbare) Sessions: zufälliger Hash, sofort abgelaufen
UPDATE sessions
   SET token_hash = UNHEX(SHA2(RANDOM_BYTES(32), 256)),
       created_at = last_activity,
       expires_at = last_activity + INTERVAL 1 SECOND
 WHERE token_hash IS NULL;

-- 3. Pflichtfelder, Eindeutigkeit, Constraints, Indizes; unbenutzte Klartext-Spalte entfernen
ALTER TABLE sessions
    MODIFY token_hash    VARBINARY(32) NOT NULL,
    MODIFY expires_at    DATETIME NOT NULL,
    MODIFY last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash (token_hash),
    ADD CONSTRAINT IF NOT EXISTS ck_sessions_token_hash_len CHECK (LENGTH(token_hash) = 32),
    ADD CONSTRAINT IF NOT EXISTS ck_sessions_expires_after_created CHECK (expires_at > created_at),
    ADD INDEX IF NOT EXISTS ix_sessions_expires_at (expires_at),
    DROP COLUMN IF EXISTS payload;
