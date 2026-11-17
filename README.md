# PiVault
PiVault ist ein selbst gehosteter Passwortmanager für den Raspberry Pi 5. Ziel des Projekts ist die sichere Verwaltung von Zugangsdaten über eine Weboberfläche, die im eigenen Netzwerk betrieben wird.
Das Projekt entsteht im Rahmen eines HTL-Projekts und befindet sich in der Entwicklung.
## Projektziel

Zugangsdaten werden häufig in Browsern oder bei Cloud-Anbietern gespeichert, auf die man keinen Einfluss hat. PiVault ermöglicht es, Passwörter auf eigener Hardware zu speichern und die Daten selbst zu kontrollieren.

PiVault soll nach dem Zero-Knowledge-Prinzip arbeiten: Passwörter werden bereits im Browser verschlüsselt, bevor sie an den Server gesendet werden. Der Server speichert ausschließlich verschlüsselte Daten und kann sie nicht lesen.

Die Verschlüsselung ist **noch nicht implementiert**. Aktuell existiert die technische Grundlage, die Anwendungsfunktionen folgen in den nächsten Entwicklungsphasen.

## Technologien

| Bereich | Technologie |
|---|---|
| Frontend | Vue 3, TypeScript |
| Webserver | Apache HTTP Server |
| Backend | Python, FastAPI, SQLAlchemy |
| Datenbank | MariaDB |
| Containerisierung | Docker Compose |
| Zielhardware | Raspberry Pi 5 |

Apache liefert das Frontend aus und leitet Anfragen unter `/api` an das Backend weiter. Backend und Datenbank sind nur im internen Docker-Netzwerk erreichbar.

## Funktionen

Geplante Funktionen, die noch nicht umgesetzt sind:

- Benutzerregistrierung und Anmeldung
- Passwortverwaltung
- Verschlüsselte Tresore
- Passwortgenerator
- Suchfunktion
- Benutzerverwaltung

## Installation und Start

Voraussetzung ist eine Installation von Docker mit Docker Compose.

1. Konfigurationsvorlage kopieren und Passwörter anpassen:

   ```bash
   cp .env.example .env
   ```

2. Container bauen und starten:

   ```bash
   docker compose up -d --build
   ```

Die Datenbanktabellen werden beim ersten Start der Datenbank automatisch aus `database/schema.sql` angelegt (nur bei leerem Datenbank-Volume). Im selben Schritt beschränkt `database/privileges.sh` den Anwendungsbenutzer auf `SELECT`, `INSERT`, `UPDATE` und `DELETE`.

### Bestehende Datenbank aktualisieren

`schema.sql` wird nur bei einem leeren Volume ausgeführt. Eine bereits vorhandene Datenbank wird mit den Skripten in `database/migrations/` in der Reihenfolge ihrer Nummern aktualisiert. Die Skripte löschen keine Tabellen und sind wiederholbar. Vorgehen:

1. Backup anlegen:

   ```bash
   docker compose exec -T database sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' > backup_vor_migration.sql
   ```

2. Änderungsskript ausführen (hier `001`):

   ```bash
   docker compose exec -T database sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' < database/migrations/001_auth_keys_sessions.sql
   ```

3. Die eingeschränkten Rechte des Anwendungsbenutzers einmalig setzen (nach einem `docker compose up -d`, das die Datei einhängt):

   ```bash
   docker compose exec database sh /docker-entrypoint-initdb.d/02-privileges.sh
   ```

4. Container mit dem aktuellen Backend neu bauen: `docker compose up -d --build`

Die Migration muss immer **vor** dem Start des neuen Backends laufen.

Die Weboberfläche ist anschließend unter `http://localhost:8080` erreichbar, der Health-Endpunkt der API unter `http://localhost:8080/api/health`. Die API-Dokumentation von FastAPI liegt unter `http://localhost:8080/api/docs`.

### Konfiguration

Die Konfiguration erfolgt über die Datei `.env`:

| Variable | Bedeutung | Standard |
|---|---|---|
| `WEB_PORT` | Port, unter dem Apache erreichbar ist | `8080` |
| `MARIADB_DATABASE` | Name der Datenbank | `pivault` |
| `MARIADB_USER` | Datenbankbenutzer | `pivault` |
| `MARIADB_PASSWORD` | Passwort des Datenbankbenutzers | muss gesetzt werden |
| `MARIADB_ROOT_PASSWORD` | Root-Passwort von MariaDB | muss gesetzt werden |

Die `.env` enthält Zugangsdaten und gehört nicht ins Repository. Die Passwörter werden nur beim ersten Anlegen der Datenbank übernommen.

### Nützliche Befehle

```bash
docker compose ps                # Status der Container
docker compose logs -f backend   # Logs anzeigen (frontend, backend oder database)
docker compose stop              # Container stoppen, Daten bleiben erhalten
```

Mit `docker compose down -v` wird das Datenbank-Volume gelöscht und damit alle gespeicherten Daten.

## Sicherheit

Geplant sind:

- Clientseitige Verschlüsselung der Tresorinhalte mit AES-256-GCM im Browser
- Das Master-Passwort wird nicht an den Server übertragen
- Speicherung der Benutzerpasswörter als Argon2id-Hash
- HTTPS über Port 443 für den produktiven Betrieb

Aktuell **nicht** umgesetzt sind Verschlüsselung, Anmeldung und HTTPS. PiVault läuft derzeit ausschließlich über HTTP und sollte in dieser Form nicht produktiv eingesetzt oder mit echten Zugangsdaten verwendet werden.

## Projektstatus

Bereits vorhanden:

- Docker-Infrastruktur mit drei Containern (Apache, FastAPI, MariaDB)
- Grundgerüst für Frontend (Vue 3 mit Startseite) und Backend (FastAPI mit Health-Endpunkt)
- MariaDB-Datenbank mit den vier Tabellen `users`, `vaults`, `vault_entries` und `sessions`, definiert in `database/schema.sql` (inklusive Feldern für die clientseitige Schlüsselverwaltung und für Sessions mit gehashtem Token)

Folgt später:

- Benutzerregistrierung und Anmeldung
- Passwortverwaltung und verschlüsselte Tresore
- Clientseitige Verschlüsselung
- HTTPS für den produktiven Betrieb
