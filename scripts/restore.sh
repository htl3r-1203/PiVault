#!/bin/bash
# ==============================================================================
# PiVault – Sicheres Datenbank-Wiederherstellungsskript
# ==============================================================================
#
# Eigenschaften:
#   - Prüft vor dem Einspielen die SHA-256-Prüfsumme der übergebenen Datei (verpflichtend;
#     ohne .sha256-Datei nur mit ALLOW_UNVERIFIED=1) und die Integrität des Backups
#     (gzip-Prüfung und Abschlusszeile des Dumps). Abgeschnittene oder beschädigte
#     Dateien werden abgewiesen, BEVOR die Datenbank angefasst wird.
#   - Legt vor dem Überschreiben automatisch ein Sicherungs-Backup des aktuellen Stands
#     an (./backups/pre-restore) und bricht ab, falls dieses fehlschlägt.
#   - Sicherheitsabfrage zur Verhinderung versehentlicher Datenüberschreibung
#   - Sichere Übergabe des Root-Passworts im Container via MYSQL_PWD
#   - Funktioniert aus jedem Arbeitsverzeichnis
#
# Wichtig: Die Wiederherstellung ersetzt alle Tabellen der Datenbank durch den Stand des
# Backups (auch die Tabellenstruktur). Backend und Frontend vorher stoppen:
#   docker compose stop backend frontend
#
# Verwendung:
#   bash scripts/restore.sh <pfad-zur-backup-datei.sql.gz>
#   (oder nach "chmod +x scripts/restore.sh": ./scripts/restore.sh <datei>)
# ==============================================================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "$#" -ne 1 ]; then
    echo "Fehler: Pfad zur Backup-Datei (.sql.gz) erforderlich!"
    echo "Verwendung: $0 <pfad-zur-backup-datei.sql.gz>"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Fehler: Backup-Datei '$1' existiert nicht!"
    exit 1
fi

# Absoluten Pfad bilden, bevor ins Projektverzeichnis gewechselt wird
BACKUP_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
PRE_RESTORE_DIR="${PRE_RESTORE_DIR:-${PROJECT_DIR}/backups/pre-restore}"

# --- 1) Prüfsumme der übergebenen Datei (Hash vergleichen, nicht den gespeicherten Pfad) ---
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "[INFO] Validiere SHA-256-Prüfsumme..."
    EXPECTED="$(awk '{print $1; exit}' "${CHECKSUM_FILE}")"
    ACTUAL="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
    if [ -z "${EXPECTED}" ] || [ "${EXPECTED}" != "${ACTUAL}" ]; then
        echo "[FEHLER] Die Prüfsumme stimmt nicht überein. Die Backup-Datei ist beschädigt oder verändert." >&2
        exit 1
    fi
    echo "[OK] Prüfsumme ist gültig."
elif [ "${ALLOW_UNVERIFIED:-0}" = "1" ]; then
    echo "[WARNUNG] Keine Prüfsummendatei (${CHECKSUM_FILE}) gefunden. Fortfahren wegen ALLOW_UNVERIFIED=1." >&2
else
    echo "[FEHLER] Keine Prüfsummendatei (${CHECKSUM_FILE}) gefunden." >&2
    echo "         Ohne Prüfsumme wird nicht wiederhergestellt. Nur wenn die Datei sicher vertrauenswürdig ist:" >&2
    echo "         ALLOW_UNVERIFIED=1 $0 <datei>" >&2
    exit 1
fi

# --- 2) Integrität des Backups, bevor die Datenbank verändert wird ---
if ! gzip -t "${BACKUP_FILE}"; then
    echo "[FEHLER] Die Backup-Datei ist beschädigt oder abgeschnitten (gzip-Prüfung fehlgeschlagen)." >&2
    exit 1
fi
LAST_LINE="$(gzip -dc "${BACKUP_FILE}" | tail -n 1)"
case "${LAST_LINE}" in
    "-- Dump completed"*) ;;
    *)
        echo "[FEHLER] Das Backup ist unvollständig (Abschlusszeile des Dumps fehlt)." >&2
        exit 1
        ;;
esac
echo "[OK] Backup ist vollständig."

# docker compose benötigt das Projektverzeichnis (compose.yaml)
cd "${PROJECT_DIR}"

echo "=================================================================="
echo " ACHTUNG: Die aktuelle PiVault-Datenbank wird überschrieben!"
echo " Ziel-Datei: ${BACKUP_FILE}"
echo " Vorher wird eine Sicherung des aktuellen Stands angelegt in:"
echo "   ${PRE_RESTORE_DIR}"
echo "=================================================================="
if [ -n "$(docker compose ps --status running -q backend 2>/dev/null || true)" ]; then
    echo "[WARNUNG] Das Backend läuft noch. Empfohlen: docker compose stop backend frontend" >&2
fi
read -r -p "Möchten Sie die Wiederherstellung wirklich durchführen? (tippen Sie 'JA'): " CONFIRM

if [ "${CONFIRM}" != "JA" ]; then
    echo "[ABBRUCH] Wiederherstellung abgebrochen."
    exit 0
fi

# --- 3) Sicherung des aktuellen Stands; ohne sie wird nichts überschrieben ---
echo "[INFO] Sichere den aktuellen Stand vor der Wiederherstellung..."
if ! bash "${SCRIPT_DIR}/backup.sh" "${PRE_RESTORE_DIR}"; then
    echo "[ABBRUCH] Die Sicherung des aktuellen Stands ist fehlgeschlagen. Es wurde nichts verändert." >&2
    exit 1
fi

# --- 4) Einspielen ---
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
echo "[INFO] Der vorherige Stand liegt in ${PRE_RESTORE_DIR}."
