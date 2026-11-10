# PiVault

PiVault ist ein selbst gehosteter **Zero-Knowledge-Passwortmanager** (HTL-Projekt), der später auf einem Raspberry Pi betrieben wird. Ver- und Entschlüsselung erfolgen ausschließlich im Browser, der Server speichert nur verschlüsselte Daten.

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Frontend | Vue 3, TypeScript, Vite (nur Build), Vue Router |
| Webserver | Apache HTTP Server (Auslieferung + Reverse Proxy) |
| Backend | Python, FastAPI, SQLAlchemy (PyMySQL) |
| Datenbank | MariaDB 11.4 |
| Betrieb | Docker, Docker Compose |
| Kommunikation | REST-API mit JSON |

```text
Browser ──HTTP──▶ Apache (frontend) ──/api──▶ FastAPI (backend) ──▶ MariaDB (database)
                  :8080 (einziger Host-Port)       intern              intern
```

## Projektstruktur

```text
PiVault/
├── docs/                 Planungsdokumente
├── frontend/             Vue-3-App + Apache
│   ├── src/              components, views, router, services (API-Client)
│   ├── Dockerfile        Multi-Stage: Vite-Build -> Apache
│   └── apache.conf       SPA-Fallback und Proxy /api
├── backend/              FastAPI-App
│   ├── app/              api (nur /api/health), core (Konfiguration), db (SQLAlchemy)
│   └── Dockerfile
├── compose.yaml          Dienste frontend, backend, database
├── .env.example          Vorlage für die Konfiguration
├── CLAUDE.md             Entwicklungsregeln
└── README.md
```

## Voraussetzungen (Fedora)

Docker Engine mit Compose-Plugin, siehe <https://docs.docker.com/engine/install/fedora/>:

```bash
sudo dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin   # nach Einrichten des Docker-Repos
sudo systemctl enable --now docker
sudo usermod -aG docker $USER      # danach neu anmelden
docker compose version
```

Node.js, Python und MariaDB müssen **nicht** lokal installiert sein.

## Starten

```bash
cp .env.example .env     # Passwörter in .env durch eigene Werte ersetzen
bash start.sh            # wählt automatisch einen freien Port ab 8080 und gibt die URL aus
```

Alternativ ohne Portsuche (feste Port aus `WEB_PORT`, Standard 8080): `docker compose up --build -d`.

- Vue-Startseite: <http://localhost:8080> (bzw. der von `start.sh` ausgegebene Port)
- Health-Endpunkt: <http://localhost:8080/api/health> → `{"status":"ok"}`
- API-Dokumentation: <http://localhost:8080/api/docs>

```bash
curl http://localhost:8080/api/health
```

Weitere Befehle:

```bash
docker compose ps                      # Status und Healthchecks
docker compose logs -f                 # Logs aller Container
docker compose logs -f backend         # Logs eines Dienstes (frontend | backend | database)
docker compose stop                    # Stoppen (Daten bleiben erhalten)
docker compose up --build -d           # nach Codeänderungen neu bauen
```

Achtung: `docker compose down -v` löscht das Datenbank-Volume und damit alle Daten.

## Umgebungsvariablen (`.env`)

| Variable | Bedeutung | Standard |
|---|---|---|
| `WEB_PORT` | Host-Port von Apache | `8080` |
| `CORS_ORIGINS` | erlaubte Origins (nur relevant, wenn das Frontend nicht über Apache läuft) | `http://localhost:8080` |
| `MARIADB_DATABASE` | Datenbankname | `pivault` |
| `MARIADB_USER` | Datenbankbenutzer | `pivault` |
| `MARIADB_PASSWORD` | Passwort des Datenbankbenutzers | muss gesetzt werden |
| `MARIADB_ROOT_PASSWORD` | Root-Passwort von MariaDB | muss gesetzt werden |

Die `.env` wird nicht in Git eingecheckt. Das Backend startet auch ohne erreichbare Datenbank, die Verbindung wird erst bei der ersten Abfrage aufgebaut. Das Passwort wird nur beim erstmaligen Anlegen des Volumes übernommen. Eine spätere Änderung in `.env` ändert das Passwort in einer bestehenden Datenbank nicht.

## Hinweise zum Raspberry-Pi-Deployment (später)

- Die verwendeten Images (`node:22-alpine`, `httpd:2.4-alpine`, `python:3.13-slim`, `mariadb:11.4`) bieten ARM64-Varianten. Auf dem Pi reicht `docker compose up --build -d`, es wird nativ gebaut. Alternativ lässt sich mit `docker buildx` auf dem PC für `linux/arm64` bauen.
- Raspberry Pi OS 64-Bit verwenden.
- Produktiv ist HTTPS erforderlich (TLS-Konfiguration in Apache). Das ist noch nicht eingerichtet, lokal wird HTTP verwendet.
- Passwörter in der `.env` auf dem Pi neu und sicher vergeben, MariaDB-Backups einplanen.

## Entwicklungsstand

**Phase 1 (Docker-Infrastruktur) ist abgeschlossen:** Vue-Grundprojekt mit Router und API-Client, Apache mit SPA-Fallback und `/api`-Proxy, FastAPI mit `GET /api/health`, vorbereitete MariaDB-Anbindung, drei Container mit Healthchecks und persistentem Volume.

Noch nicht umgesetzt: Registrierung/Login, Tresore und Einträge, Verschlüsselung, Datenbanktabellen und Migrationen, HTTPS und Produktivdeployment.
