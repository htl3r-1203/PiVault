#!/bin/bash
# ==============================================================================
# PiVault – Sicheres Datenbank-Backup-Skript für MariaDB 11.4
# ==============================================================================
#
# Eigenschaften:
#   - Konsistentes Online-Backup ohne Tabellensperren (--single-transaction)
#   - Geringe I/O-Last auf dem Raspberry Pi (--quick)
#   - Passwort wird niemals auf der Host-Kommandozeile / Prozessliste exponiert
#   - Gzip-Komprimierung (Stufe 9)
#   - SHA-256-Prüfsumme für Integritätsvalidierung
#   - Restriktive Dateiberechtigungen (chmod 600)
#   - Automatische Rotation alter Backups (Standard: 14 Tage)
#
# Verwendung:
#   chmod +x scripts/backup.sh
#   ./scripts/backup.sh [zielverzeichnis]
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS=14
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pivault_db_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[INFO] Starte konsistentes MariaDB-Backup für PiVault..."

# Backup über docker compose direkt ausführen, ohne Passwörter im Host-Prozessbaum zu zeigen
docker compose exec -T database sh -c '
    set -e
    : "${MARIADB_DATABASE:?MARIADB_DATABASE ist nicht gesetzt}"
    : "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD ist nicht gesetzt}"
    MYSQL_PWD="${MARIADB_ROOT_PASSWORD}" mariadb-dump \
        -u root \
        --single-transaction \
        --quick \
        --lock-tables=false \
        --routines \
        --triggers \
        "${MARIADB_DATABASE}"
' | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"

# SHA-256-Prüfsumme erzeugen
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
chmod 600 "${BACKUP_FILE}.sha256"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[ERFOLG] Backup erfolgreich erstellt: ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "[INFO] SHA-256: $(cat "${BACKUP_FILE}.sha256")"

# Rotation alter Backups
echo "[INFO] Bereinige Backups älter als ${RETENTION_DAYS} Tage..."
find "${BACKUP_DIR}" -name "pivault_db_*.sql.gz*" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[INFO] Backup-Vorgang abgeschlossen."
