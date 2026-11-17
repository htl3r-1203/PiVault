#!/bin/sh
# PiVault – Laufzeitrechte des Anwendungsbenutzers einschränken (Least Privilege)
#
# Das MariaDB-Image legt MARIADB_USER mit ALL PRIVILEGES auf die Datenbank an.
# Das Backend braucht zur Laufzeit nur Datenzugriff, kein DDL (das Schema wird
# ausschließlich über database/schema.sql und database/migrations/ verwaltet).
# Danach darf der Benutzer nur noch SELECT, INSERT, UPDATE und DELETE ausführen,
# also kein CREATE, ALTER oder DROP.
#
# Läuft beim ersten Start automatisch (compose.yaml mountet diese Datei nach
# /docker-entrypoint-initdb.d/02-privileges.sh, nach 01-schema.sql).
# Für eine BESTEHENDE Datenbank einmalig ausführen:
#   docker compose exec database sh /docker-entrypoint-initdb.d/02-privileges.sh
# Rückgängig: GRANT ALL PRIVILEGES ON `<datenbank>`.* TO '<benutzer>'@'%';
#
# Nutzt die Umgebungsvariablen des Datenbank-Containers (MARIADB_*), keine
# Zugangsdaten stehen in dieser Datei.

set -eu

: "${MARIADB_USER:?MARIADB_USER fehlt}"
: "${MARIADB_DATABASE:?MARIADB_DATABASE fehlt}"
: "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD fehlt}"

mariadb -u root -p"${MARIADB_ROOT_PASSWORD}" <<SQL
REVOKE ALL PRIVILEGES ON \`${MARIADB_DATABASE}\`.* FROM '${MARIADB_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MARIADB_DATABASE}\`.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "PiVault: Rechte für '${MARIADB_USER}' auf '${MARIADB_DATABASE}' auf SELECT, INSERT, UPDATE, DELETE beschränkt."
