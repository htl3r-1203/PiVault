# CLAUDE.md – Entwicklungsregeln für PiVault

PiVault ist ein selbst gehosteter Zero-Knowledge-Passwortmanager (HTL-Projekt). Planungsdokumente liegen in `docs/` und dürfen nur auf ausdrücklichen Auftrag geändert werden.

## Technologie-Stack (verbindlich)
- Frontend: Vue 3, TypeScript, Vite (nur als Build-Werkzeug), Vue Router
- Webserver: Apache HTTP Server (liefert das gebaute Frontend aus und leitet `/api` an FastAPI weiter)
- Backend: Python, FastAPI, Pydantic, SQLAlchemy (Treiber PyMySQL)
- Datenbank: MariaDB
- REST-API mit JSON (lokal HTTP, produktiv HTTPS)
- Kein PHP, Laravel, Symfony, Django oder Node.js als Backend. Node.js nur für das Frontend.
- Entwicklung: Fedora Linux. Zielsystem: Raspberry Pi OS (ARM64).

## Docker (Pflicht)
- Alle Komponenten laufen in Docker-Containern (`docker compose up --build -d`): `frontend` (Apache), `backend` (FastAPI), `database` (MariaDB).
- Nur Apache ist am Host erreichbar. Backend- und Datenbank-Port werden nicht veröffentlicht.
- Kein dauerhaft laufender Vite-Dev-Server. Keine destruktiven Docker-Befehle (kein `docker compose down -v`) ohne ausdrücklichen Auftrag.

## Zero-Knowledge-Prinzip
- Ver- und Entschlüsselung sowie die gesamte Schlüsselverwaltung passieren ausschließlich clientseitig im Browser (Vue/TypeScript).
- Das Masterpasswort wird nie an das Backend gesendet. Das Backend erhält und speichert nur verschlüsselte Tresorinhalte.
- Server-Authentifizierung und Entschlüsselung der Tresordaten sind getrennt.

## Git
- **Keine Commits, keine Pushes, keine Branch- oder sonstigen Git-Änderungen.** Nur lesende Befehle (`git status`, `git diff`, `git log`). Git-Aktionen macht der Entwickler selbst.

## Arbeitsweise
- Keine eigenständige Implementierung zusätzlicher Funktionen. Nur umsetzen, was ausdrücklich beauftragt ist.
- Vor größeren Änderungen zuerst den geplanten Ablauf erklären.
- Projektstruktur einfach und nachvollziehbar halten, keine unnötigen Abstraktionen oder Abhängigkeiten.
- Keine Zugangsdaten im Quellcode. Konfiguration über die Root-`.env` (nicht in Git), Vorlage in `.env.example`.
- Das ER-/Relationenmodell ist noch nicht abgenommen und wird nicht implementiert.
