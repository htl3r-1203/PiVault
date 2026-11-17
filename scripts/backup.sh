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
#   - Das Backup wird zuerst in eine .partial-Datei geschrieben, auf Vollständigkeit
#     geprüft (gzip-Integrität + Dump-Abschlusszeile) und erst dann umbenannt.
#     Bei einem Fehler bleibt nie eine unvollständige Datei als Backup zurück.
#   - SHA-256-Prüfsumme (mit Dateiname ohne Pfad, damit sie auch nach dem Verschieben
#     oder Kopieren des Backups prüfbar bleibt)
#   - Restriktive Dateiberechtigungen (umask 077: Dateien 600, neues Verzeichnis 700)
#   - Rotation alter Backups (Standard: älter als 14 Tage), es bleiben aber immer
#     mindestens die 3 neuesten Backups erhalten
#   - Funktioniert aus jedem Arbeitsverzeichnis
#
# Verwendung:
#   bash scripts/backup.sh [zielverzeichnis]      (Standard: ./backups im Aufrufverzeichnis)
#   (oder nach "chmod +x scripts/backup.sh": ./scripts/backup.sh)
# ==============================================================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Zielverzeichnis relativ zum Aufrufverzeichnis auflösen, bevor ins Projektverzeichnis gewechselt wird
BACKUP_DIR_ARG="${1:-./backups}"
case "${BACKUP_DIR_ARG}" in
    /*) BACKUP_DIR="${BACKUP_DIR_ARG}" ;;
    *)  BACKUP_DIR="$(pwd)/${BACKUP_DIR_ARG#./}" ;;
esac

RETENTION_DAYS=14
MIN_KEEP=3
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pivault_db_${TIMESTAMP}.sql.gz"
PARTIAL_FILE="${BACKUP_FILE}.partial"

# docker compose benötigt das Projektverzeichnis (compose.yaml)
cd "${PROJECT_DIR}"

# Ein bereits vorhandenes Zielverzeichnis wird nicht verändert (z. B. ein eingehängtes Laufwerk)
if [ ! -d "${BACKUP_DIR}" ]; then
    mkdir -p "${BACKUP_DIR}"
    chmod 700 "${BACKUP_DIR}"
fi

# Unvollständige Datei bei jedem Abbruch entfernen
trap 'rm -f "${PARTIAL_FILE}"' EXIT

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
' | gzip -9 > "${PARTIAL_FILE}"

# Vollständigkeit prüfen: gzip-Integrität und Abschlusszeile von mariadb-dump
if ! gzip -t "${PARTIAL_FILE}"; then
    echo "[FEHLER] Das Backup ist beschädigt (gzip-Prüfung fehlgeschlagen). Es wurde verworfen." >&2
    exit 1
fi
LAST_LINE="$(gzip -dc "${PARTIAL_FILE}" | tail -n 1)"
case "${LAST_LINE}" in
    "-- Dump completed"*) ;;
    *)
        echo "[FEHLER] Das Backup ist unvollständig (Abschlusszeile des Dumps fehlt). Es wurde verworfen." >&2
        exit 1
        ;;
esac

mv "${PARTIAL_FILE}" "${BACKUP_FILE}"

# SHA-256-Prüfsumme mit Dateinamen ohne Pfad erzeugen
( cd "${BACKUP_DIR}" && sha256sum "$(basename "${BACKUP_FILE}")" > "$(basename "${BACKUP_FILE}").sha256" )

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[ERFOLG] Backup erfolgreich erstellt: ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "[INFO] SHA-256: $(cat "${BACKUP_FILE}.sha256")"

# Rotation alter Backups: nie unter MIN_KEEP Backups gehen
echo "[INFO] Bereinige Backups älter als ${RETENTION_DAYS} Tage (mindestens ${MIN_KEEP} bleiben erhalten)..."
mapfile -t ALL_BACKUPS < <(ls -1t "${BACKUP_DIR}"/pivault_db_*.sql.gz 2>/dev/null || true)
if [ "${#ALL_BACKUPS[@]}" -gt "${MIN_KEEP}" ]; then
    for OLD in "${ALL_BACKUPS[@]:${MIN_KEEP}}"; do
        if [ -n "$(find "${OLD}" -type f -mtime "+${RETENTION_DAYS}" -print)" ]; then
            rm -f -- "${OLD}" "${OLD}.sha256"
        fi
    done
fi

echo "[INFO] Backup-Vorgang abgeschlossen."
