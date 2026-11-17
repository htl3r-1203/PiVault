#!/bin/bash
# ==============================================================================
# PiVault – Sicheres Datenbank-Wiederherstellungsskript
# ==============================================================================
#
# Eigenschaften:
#   - Prüft die SHA-256-Prüfsumme der Backup-Datei vor dem Einspielen
#   - Sicherheitsabfrage zur Verhinderung versehentlicher Datenüberschreibung
#   - Sichere Übergabe des Root-Passworts im Container via MYSQL_PWD
#
# Verwendung:
#   chmod +x scripts/restore.sh
#   ./scripts/restore.sh <pfad-zur-backup-datei.sql.gz>
# ==============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Fehler: Pfad zur Backup-Datei (.sql.gz) erforderlich!"
    echo "Verwendung: $0 <pfad-zur-backup-datei.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Fehler: Backup-Datei '${BACKUP_FILE}' existiert nicht!"
    exit 1
fi

# Prüfsummenvalidierung, falls vorhanden
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "[INFO] Validiere SHA-256-Prüfsumme..."
    sha256sum --check "${CHECKSUM_FILE}"
    echo "[OK] Prüfsumme ist gültig."
else
    echo "[WARNUNG] Keine Prüfsummendatei (${CHECKSUM_FILE}) gefunden!"
fi

echo "=================================================================="
echo " ACHTUNG: Die aktuelle PiVault-Datenbank wird überschrieben!"
echo " Ziel-Datei: ${BACKUP_FILE}"
echo "=================================================================="
read -r -p "Möchten Sie die Wiederherstellung wirklich durchführen? (tippen Sie 'JA'): " CONFIRM

if [ "${CONFIRM}" != "JA" ]; then
    echo "[ABBRUCH] Wiederherstellung abgebrochen."
    exit 0
fi

echo "[INFO] Spiele Datenbank-Backup ein..."

gunzip -c "${BACKUP_FILE}" | docker compose exec -T database sh -c '
    set -e
    : "${MARIADB_DATABASE:?MARIADB_DATABASE ist nicht gesetzt}"
    : "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD ist nicht gesetzt}"
    MYSQL_PWD="${MARIADB_ROOT_PASSWORD}" mariadb \
        -u root \
        "${MARIADB_DATABASE}"
'

echo "[ERFOLG] Datenbank wurde erfolgreich aus '${BACKUP_FILE}' wiederhergestellt."
