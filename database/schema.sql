-- PiVault – Datenbankschema (MariaDB)
--
-- Zero-Knowledge: Tresorinhalte werden ausschließlich verschlüsselt gespeichert.
-- Ver- und Entschlüsselung sowie die Schlüsselableitung passieren im Browser,
-- der Server sieht nur Binärdaten und öffentliche Metadaten.
-- Nonce = 12 Byte, Auth-Tag = 16 Byte (AES-256-GCM), erzwungen über CHECK-Constraints.
--
-- Zwei vollständig getrennte Passwörter:
--   * Login-Passwort  -> users.password_hash (Argon2id, serverseitig gehasht)
--   * Master-Passwort -> wird NIE an den Server gesendet und NIE gespeichert.
--     Gespeichert sind nur Salt, KDF-Parameter und der mit dem Master-Passwort
--     verschlüsselte Tresorschlüssel (users.master_kdf_* / encrypted_vault_key).
--
-- Nicht enthalten (spätere Erweiterung): folders, devices, audit_logs.
--
-- Wird beim ersten Start der Datenbank automatisch ausgeführt
-- (gemountet nach /docker-entrypoint-initdb.d/, siehe compose.yaml).
-- Für bestehende Datenbanken siehe database/migrations/.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- users
--
-- Schlüsselverwaltung (Key-Wrapping), alles clientseitig erzeugt:
--   1. Browser erzeugt zufälligen 256-Bit-Tresorschlüssel (Vault Key).
--   2. Aus dem Master-Passwort wird per Argon2id (Salt + Parameter unten)
--      ein Key-Encryption-Key (KEK) abgeleitet.
--   3. Vault Key wird mit dem KEK per AES-256-GCM verschlüsselt:
--        encrypted_vault_key (32 Byte Ciphertext) + vault_key_nonce + vault_key_tag
--   4. Master-Passwort ändern = Vault Key neu verschlüsseln, Einträge bleiben unberührt.
--
-- Die fünf Schlüsselfelder sind entweder alle NULL (Tresor noch nicht eingerichtet,
-- z. B. Konto vor der Einrichtung durch den Client) oder alle gesetzt.
--
-- master_kdf_params: versioniertes JSON-Objekt, z. B.
--   {"v":1,"alg":"argon2id","m":65536,"t":3,"p":1,"len":32}
--   v = Version des Parameterformats (positive Ganzzahl, Pflicht), m = Speicher in KiB,
--   t = Iterationen, p = Parallelität, len = Schlüssellänge in Byte.
--   Die genauen Werte und Grenzen validiert später die API.
-- master_kdf_salt: zufällig pro Benutzer (16–32 Byte), keine deterministische Ableitung.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    PK_User_ID          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username            VARCHAR(50)  NOT NULL,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,            -- Login-Passwort, Argon2id-Hash
    master_kdf_salt     VARBINARY(32) NULL,
    master_kdf_params   JSON         NULL,
    encrypted_vault_key VARBINARY(32) NULL,
    vault_key_nonce     VARBINARY(12) NULL,
    vault_key_tag       VARBINARY(16) NULL,
    email_verified_at   DATETIME     NULL,
    account_status      VARCHAR(20)  NOT NULL DEFAULT 'active',
    locked_until        DATETIME     NULL,
    last_login_at       DATETIME     NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users          PRIMARY KEY (PK_User_ID),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email),
    CONSTRAINT ck_users_kdf_salt_len CHECK (master_kdf_salt IS NULL OR LENGTH(master_kdf_salt) BETWEEN 16 AND 32),
    CONSTRAINT ck_users_kdf_params_format CHECK (master_kdf_params IS NULL OR (JSON_TYPE(master_kdf_params) = 'OBJECT' AND COALESCE(JSON_VALUE(master_kdf_params, '$.v'), '') REGEXP '^[1-9][0-9]*$')),
    CONSTRAINT ck_users_vault_key_len       CHECK (encrypted_vault_key IS NULL OR LENGTH(encrypted_vault_key) = 32),
    CONSTRAINT ck_users_vault_key_nonce_len CHECK (vault_key_nonce IS NULL OR LENGTH(vault_key_nonce) = 12),
    CONSTRAINT ck_users_vault_key_tag_len   CHECK (vault_key_tag IS NULL OR LENGTH(vault_key_tag) = 16),
    CONSTRAINT ck_users_vault_key_complete CHECK (
        (master_kdf_salt IS NULL AND master_kdf_params IS NULL AND encrypted_vault_key IS NULL AND vault_key_nonce IS NULL AND vault_key_tag IS NULL)
        OR
        (master_kdf_salt IS NOT NULL AND master_kdf_params IS NOT NULL AND encrypted_vault_key IS NOT NULL AND vault_key_nonce IS NOT NULL AND vault_key_tag IS NOT NULL)
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- vaults (Name und Beschreibung sind mit dem Tresorschlüssel verschlüsselt)
-- ---------------------------------------------------------------------------
CREATE TABLE vaults (
    PK_Vault_ID           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    FK_user_id            INT UNSIGNED  NOT NULL,
    encrypted_name        VARBINARY(1024) NOT NULL,
    name_nonce            VARBINARY(12)   NOT NULL,
    name_tag              VARBINARY(16)   NOT NULL,
    encrypted_description VARBINARY(4096) NULL,
    description_nonce     VARBINARY(12)   NULL,
    description_tag       VARBINARY(16)   NULL,
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_vaults PRIMARY KEY (PK_Vault_ID),
    CONSTRAINT fk_vaults_FK_user_id_users
        FOREIGN KEY (FK_user_id) REFERENCES users (PK_User_ID) ON DELETE CASCADE,
    CONSTRAINT ck_vaults_name_nonce_len CHECK (LENGTH(name_nonce) = 12),
    CONSTRAINT ck_vaults_name_tag_len   CHECK (LENGTH(name_tag) = 16),
    CONSTRAINT ck_vaults_desc_nonce_len CHECK (description_nonce IS NULL OR LENGTH(description_nonce) = 12),
    CONSTRAINT ck_vaults_desc_tag_len   CHECK (description_tag IS NULL OR LENGTH(description_tag) = 16),
    CONSTRAINT ck_vaults_name_not_empty CHECK (LENGTH(encrypted_name) > 0),
    -- Beschreibung, Nonce und Tag gehören zusammen: entweder alle NULL oder alle gesetzt
    CONSTRAINT ck_vaults_desc_complete CHECK (
        (encrypted_description IS NULL AND description_nonce IS NULL AND description_tag IS NULL)
        OR
        (encrypted_description IS NOT NULL AND description_nonce IS NOT NULL AND description_tag IS NOT NULL)
    )
) ENGINE=InnoDB;

CREATE INDEX ix_vaults_FK_user_id ON vaults (FK_user_id);

-- ---------------------------------------------------------------------------
-- vault_entries (gesamter Eintrag als verschlüsselter Block)
-- ---------------------------------------------------------------------------
CREATE TABLE vault_entries (
    PK_VaultEntry_ID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    FK_vault_id      INT UNSIGNED NOT NULL,
    encrypted_data   MEDIUMBLOB   NOT NULL,
    nonce            VARBINARY(12) NOT NULL,
    auth_tag         VARBINARY(16) NOT NULL,
    is_favorite      BOOL         NULL,
    sort_order       INT          NULL,
    last_accessed_at DATETIME     NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,                   -- Soft Delete
    CONSTRAINT pk_vault_entries PRIMARY KEY (PK_VaultEntry_ID),
    CONSTRAINT fk_vault_entries_FK_vault_id_vaults
        FOREIGN KEY (FK_vault_id) REFERENCES vaults (PK_Vault_ID) ON DELETE CASCADE,
    CONSTRAINT ck_vault_entries_nonce_len    CHECK (LENGTH(nonce) = 12),
    CONSTRAINT ck_vault_entries_auth_tag_len CHECK (LENGTH(auth_tag) = 16),
    CONSTRAINT ck_vault_entries_data_not_empty CHECK (LENGTH(encrypted_data) > 0)
) ENGINE=InnoDB;

CREATE INDEX ix_vault_entries_FK_vault_id ON vault_entries (FK_vault_id);

-- ---------------------------------------------------------------------------
-- sessions (serverseitige Sitzungen)
--
-- Der Session-Token wird kryptografisch sicher zufällig erzeugt (mind. 32 Byte)
-- und nur an den Client gegeben. In der Datenbank steht ausschließlich der
-- SHA-256-Hash des Tokens (token_hash, 32 Byte). PK_Session_ID ist nur ein
-- interner Schlüssel und darf NIE als Token dienen.
--   * expires_at    = feste, absolute Ablaufzeit (wird beim Anlegen gesetzt)
--   * last_activity = für Inaktivitäts-Timeout
--   * Abmeldung/Widerruf = Zeile serverseitig löschen
--   * Abgelaufene Zeilen: DELETE FROM sessions WHERE expires_at < NOW()
--
-- Die frühere Spalte "payload" (TEXT, Klartext) wurde entfernt: Die Sitzung wird
-- vollständig über token_hash und FK_user_id identifiziert, es gibt keine
-- Sitzungsdaten, die gespeichert werden müssten.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
    PK_Session_ID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    FK_user_id    INT UNSIGNED NOT NULL,
    token_hash    VARBINARY(32) NOT NULL,                 -- SHA-256 des Session-Tokens
    ip_address    VARCHAR(45)  NOT NULL,                  -- IPv4 oder IPv6
    user_agent    VARCHAR(512) NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    DATETIME     NOT NULL,
    last_activity DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_sessions PRIMARY KEY (PK_Session_ID),
    CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_sessions_FK_user_id_users
        FOREIGN KEY (FK_user_id) REFERENCES users (PK_User_ID) ON DELETE CASCADE,
    CONSTRAINT ck_sessions_token_hash_len CHECK (LENGTH(token_hash) = 32),
    CONSTRAINT ck_sessions_expires_after_created CHECK (expires_at > created_at)
) ENGINE=InnoDB;

CREATE INDEX ix_sessions_FK_user_id    ON sessions (FK_user_id);
CREATE INDEX ix_sessions_last_activity ON sessions (last_activity);
CREATE INDEX ix_sessions_expires_at    ON sessions (expires_at);
