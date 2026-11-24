# PiVault – Dokumentation der Server-Härtung (Infrastruktur & Sicherheit)

Dieses Dokument erklärt einfach und übersichtlich für das gesamte Projektteam, welche Sicherheits- und Härtungsmaßnahmen an der Serverinfrastruktur von **PiVault** umgesetzt wurden, warum sie notwendig waren und wie sie im Detail funktionieren.

---

## 1. Überblick: Warum war das Hardening nötig?

PiVault ist als selbst gehosteter Passwortmanager auf einem **Raspberry Pi 5** konzipiert. Da auf einem Passwortmanager hochsensible Daten verwaltet werden, reicht es nicht aus, nur den Anwendungscode abzusichern. Auch die gesamte Umgebung (Docker-Container, Webserver, Netzwerk und Datenbank) muss nach dem Prinzip **Defense in Depth** (Verteidigung in der Tiefe) und **Least Privilege** (so wenige Rechte wie nötig) abgesichert sein.

Zudem hat ein Raspberry Pi 5 begrenzte Systemressourcen (CPU/RAM, Lebensdauer von SD-Karten/SSDs), weshalb Schutz vor Denial-of-Service-Angriffen (DoS) und Speicherüberlastung essenziell ist.

---

## 2. Was wurde im Detail gemacht?

Die Umsetzung lässt sich in vier Hauptbereiche unterteilen:

```
                  ┌────────────────────────────────────────┐
                  │          Benutzer / Browser            │
                  └───────────────────┬────────────────────┘
                                      │ Port 8080 (HTTP) / 8443 (HTTPS)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Docker-Netzwerk: frontend-net                                                   │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Frontend-Container (Apache 2.4)                                        │   │
│   │  - Liefert Vue 3 Frontend aus                                           │   │
│   │  - Sicherheitsheader & strikte Content-Security-Policy (CSP)            │   │
│   │  - Read-Only Dateisystem (tmpfs für Logs & /tmp)                        │   │
│   │  - TLS 1.2 / 1.3 vorbereitet (aktiviert sich automatisch bei Certs)    │   │
│   │  - Leitet /api an Backend weiter                                        │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │ interner Port 8000
┌────────────────────────────────────────┼────────────────────────────────────────┐
│ Docker-Netzwerk: backend-net (ISOLIERT)│                                        │
│                                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Backend-Container (FastAPI / Python)                                   │   │
│   │  - Non-Root Benutzer (pivault) & 0 Linux-Capabilities                  │   │
│   │  - Rate-Limiting gegen DoS (Argon2id CPU-Schutz)                        │   │
│   │  - Account-Lockout nach 5 Fehlversuchen (users.locked_until)            │   │
│   │  - Max. Request-Größe (1 MB) gegen Speichererschöpfung                  │   │
│   │  - Swagger/OpenAPI in Produktion deaktiviert                            │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
│                                        │ interner Port 3306                     │
│                                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Datenbank-Container (MariaDB 11.4 LTS)                                  │   │
│   │  - VÖLLIG GETRENNT vom Frontend (Frontend kann DB nicht anpingen!)      │   │
│   │  - Anwendungsnutzer hat nur Datenrechte (SELECT, INSERT, UPDATE, DELETE)│   │
│   │  - Keine Ports nach außen geöffnet                                     │   │
│   │  - Automatisierte Backup- und Restore-Skripte                           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Bereich 1: Docker & Container-Sicherheit (`compose.yaml`)

1. **Netzwerktrennung (Segmentierung):**
   - **Vorher:** Alle drei Dienste (`frontend`, `backend`, `database`) waren im selben Netzwerk. Hätte jemand den Webserver gekapert, hätte er sofort die Datenbank direkt angreifen können.
   - **Jetzt:** Es gibt zwei getrennte Netzwerke:
     - `frontend-net`: Verbindet nur Apache und FastAPI.
     - `backend-net`: Verbindet nur FastAPI und MariaDB. Dieses Netzwerk ist als `internal: true` markiert (hat keinen Internetzugang nach draußen).
   - **Ergebnis:** Der Apache-Webserver kann die Datenbank netzwerktechnisch gar nicht mehr erreichen.

2. **Rechte-Einschränkung (`no-new-privileges` & Linux-Capabilities):**
   - Für alle Container wurde `no-new-privileges: true` gesetzt. Prozesse können dadurch nicht über Systembefehle (SUID) Administratorrechte im Container erlangen.
   - Überflüssige Linux-Kernel-Rechte wurden entfernt (`cap_drop: [ALL]`).
   - Das Backend läuft als dedizierter, unprivilegierter Benutzer `pivault` mit **0 Rechten**.

3. **Read-Only Dateisysteme:**
   - Sowohl der Frontend- als auch der Backend-Container haben nun ein schreibgeschütztes Dateisystem (`read_only: true`).
   - Ein Angreifer kann bei einem Exploit keine Dateien, Skripte oder Hintertüren im Container ablegen.
   - Für zwingend benötigte temporäre Dateien (wie Logs oder `/tmp`) wurden flüchtige `tmpfs`-Speicher im RAM zugewiesen.

4. **Ressourcenlimits & Log-Begrenzung:**
   - Damit ein Fehler oder Angriff nicht den gesamten Raspberry Pi lahmlegt, wurden feste Limits gesetzt:
     - Frontend: max. 256 MB RAM, 1 CPU
     - Backend: max. 1024 MB RAM, 2 CPUs
     - Datenbank: max. 1536 MB RAM, 2 CPUs
   - Docker-Logs werden automatisch rotiert (max. 10 MB, maximal 3 Dateien), damit die Speicherkarte nicht vollläuft.

---

### Bereich 2: Webserver & Apache (`frontend/apache.conf`)

1. **Content Security Policy (CSP):**
   - Es wurde eine strikte Sicherheitsrichtlinie für den Browser hinterlegt:
     `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; ...`
   - **Bedeutung:** Das Frontend darf Daten **ausschließlich** vom eigenen PiVault-Server laden und senden. Selbst wenn Schadcode über eine npm-Bibliothek eingeschleust würde, kann dieser keine Passwörter an fremde Server übertragen (`connect-src 'self'`).

2. **Weitere Sicherheitsheader:**
   - `X-Frame-Options: DENY` (Schutz vor Clickjacking / Einbettung in fremde iFrames).
   - `X-Content-Type-Options: nosniff` (Verhindert MIME-Typ-Verfälschung).
   - `Referrer-Policy: same-origin` (Keine Adressdaten an fremde Seiten leaken).
   - `Permissions-Policy` (Deaktiviert ungenutzte Browser-Funktionen wie Kamera, Mikrofon, Standort).
   - `TraceEnable Off` (Deaktiviert die unsichere HTTP-Methode `TRACE`).

3. **Modulare TLS / HTTPS-Vorbereitung:**
   - Apache prüft über `<IfFile>` automatisch, ob Zertifikatsdateien im Ordner `./ssl/` liegen.
   - **Ohne Zertifikat (z. B. lokale Entwicklung):** Apache startet problemlos und stabil auf Port 8080 (HTTP).
   - **Mit Zertifikat (Produktion):** Apache aktiviert sofort Port 8443 (HTTPS), nutzt moderne Verschlüsselung (TLS 1.2 und TLS 1.3 mit sicheren AEAD-Ciphers), aktiviert HSTS und leitet HTTP-Anfragen automatisch auf HTTPS um.

---

### Bereich 3: Backend & FastAPI (`backend/app/`)

1. **Schutz vor Denial-of-Service & Brute-Force (Rate-Limiting):**
   - PiVault nutzt **Argon2id** für das Hashen der Login-Passwörter. Das ist kryptografisch sehr sicher, verbraucht aber bewusst CPU und Arbeitsspeicher.
   - Ohne Begrenzung könnte ein Angreifer mit hunderten Login-Versuchen den Raspberry Pi sofort überlasten.
   - **Lösung:** Ein neuer, thread-sicherer Rate-Limiter (`app/core/rate_limit.py`) begrenzt Anfragen pro IP-Adresse:
     - Login: maximal 5 Versuche pro Minute.
     - Registrierung: maximal 3 Versuche pro 5 Minuten.
     - Zu viele Versuche werden mit `HTTP 429 Too Many Requests` und einem `Retry-After`-Header abgewiesen.

2. **Automatischer Account-Lockout:**
   - Gibt jemand 5-mal hintereinander das falsche Passwort für ein existierendes Konto ein, wird das Konto in der Datenbank für 15 Minuten gesperrt (`users.locked_until`).
   - **Wichtig für Datenschutz:** Falsche Anmeldeversuche geben immer `HTTP 401` zurück – ein Angreifer erfährt dadurch nie, ob ein Account existiert oder bereits gesperrt ist.
   - Erst bei Eingabe des richtigen Passworts bei aktiver Sperre meldet das System `HTTP 403` (Konto gesperrt).

3. **Request-Größenbegrenzung:**
   - Eine neue Middleware (`ContentSizeLimitMiddleware`) blockiert Anfragen, die größer als 1 MB sind, direkt mit `HTTP 413 Payload Too Large`. Das verhindert Speicherüberläufe durch riesige JSON-Payloads.

4. **Produktions-Härtung:**
   - Die interaktive Dokumentation (`/api/docs`, `/api/redoc`, `/api/openapi.json`) ist in Produktion standardmäßig deaktiviert, um keine Schnittstellen-Interna preiszugeben.
   - Unerwartete Fehler (500) leaken keine Python-Stacktraces mehr an den Client, sondern liefern eine saubere, neutrale Fehlermeldung.

---

### Bereich 4: MariaDB & Datenbankverwaltung

1. **Rechtebeschränkung (Least Privilege):**
   - Das Backend nutzt niemals den MariaDB-Root-Benutzer.
   - Der Anwendungsbenutzer `pivault` besitzt nach dem Start ausschließlich DML-Rechte (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Er darf keine Tabellen erstellen oder löschen (`CREATE`, `DROP`).

2. **Backup- & Restore-Automatisierung:**
   - Zwei neue Shell-Skripte wurden in `scripts/` erstellt:
     - `scripts/backup.sh`: Erstellt ein konsistentes Online-Backup der InnoDB-Datenbank (`--single-transaction`), komprimiert es mit `gzip -9`, erzeugt eine SHA-256-Prüfsumme und löscht Backups, die älter als 14 Tage sind. Passwörter werden sicher im Container übergeben und tauchen nicht im Prozessbaum auf.
     - `scripts/restore.sh`: Prüft vor dem Einspielen die SHA-256-Prüfsumme und verlangt eine Bestätigung, um versehentliches Überschreiben zu verhindern.

---

## 3. Wichtig für unser Team: Die 3 Verschlüsselungsebenen

In Diskussionen und für die HTL-Dokumentation dürfen diese drei Begriffe nicht verwechselt werden:

| Verschlüsselungsart | Wo findet sie statt? | Was schützt sie? | Status in PiVault |
|---|---|---|---|
| **1. Clientseitige Zero-Knowledge-Verschlüsselung** | Im Webbrowser des Nutzers (Vue-Frontend) | Tresor-Passwörter & Notizen vor Server-Admins & DB-Leaks | Datenmodell/Backend vorbereitet; Vue-Crypto-Logik folgt |
| **2. Transportverschlüsselung (In-Transit)** | Zwischen Browser und Webserver (TLS 1.2/1.3) | Schützt Cookies, Logins und Daten im WLAN/Netzwerk | **Vollständig implementiert & vorbereitet** |
| **3. Datenträgerverschlüsselung (At-Rest)** | Auf dem Betriebssystem des Pi (z. B. LUKS) | Schützt Daten bei physischem Diebstahl der SD-Karte/SSD | Als Host-Maßnahme dokumentiert |

---

## 4. Übersicht der geänderten und neuen Dateien

```
PiVault/
├── compose.yaml                             <- Gehärtete Container-Konfiguration & Netzwerke
├── .env.example                             <- Vorlage mit neuen Sicherheitsparametern
├── ssl/
│   └── .gitkeep                             <- Ordner für TLS-Zertifikate
├── frontend/
│   ├── Dockerfile                           <- Apache SSL-Module & Ports aktiviert
│   └── apache.conf                          <- CSP, Security-Header & modulare TLS-Config
├── backend/
│   ├── app/
│   │   ├── main.py                          <- Middlewares, sichere CORS-Header, Exception-Handler
│   │   ├── api/
│   │   │   └── auth.py                      <- Rate-Limiting & Account-Lockout eingebunden
│   │   ├── core/
│   │   │   ├── config.py                    <- Einstellungen für Limits, Hosts & Secret-Files
│   │   │   ├── middleware.py        (NEU)   <- Request-Size (413) & Sicherheitsheader
│   │   │   └── rate_limit.py        (NEU)   <- Thread-sicherer Sliding-Window Rate-Limiter
│   │   └── db/
│   │       └── session.py                   <- Connection-Pool-Limits & Secret-Support
│   └── tests/
│       ├── conftest.py                      <- Rate-Limiter-Reset in Testsuite
│       └── test_security_hardening.py (NEU) <- Automatisierte Regressionstests
├── database/
│   └── privileges.sh                        <- Sichere Rechtevergabe ohne CLI-Passwort-Leak
└── scripts/
    ├── backup.sh                    (NEU)   <- Konsistente, rotierte MariaDB-Backups
    └── restore.sh                   (NEU)   <- Geprüfte Wiederherstellung mit Prüfsummen
```

---

## 5. Wie arbeite ich als Entwickler damit?

Für die normale Entwicklung ändert sich fast nichts:

1. **Projekt wie gewohnt starten:**
   ```bash
   docker compose up -d --build
   ```
2. **Weboberfläche aufrufen:**
   Unter `http://localhost:8080` (oder Port laut `.env`).
3. **API-Dokumentation im Entwicklungsmodus anzeigen:**
   In Produktion ist Swagger (`/api/docs`) aus Sicherheitsgründen aus. Wer es beim Entwickeln braucht, setzt in seiner lokalen `.env`:
   ```ini
   DOCS_ENABLED=true
   ```
4. **HTTPS testen (optional):**
   Wer HTTPS testen möchte, legt `fullchain.pem` und `privkey.pem` in den Ordner `ssl/` und setzt in der `.env`:
   ```ini
   COOKIE_SECURE=true
   ```
   Apache schaltet dann automatisch auf Port 8443 (HTTPS) um.
5. **Datenbank sichern:**
   ```bash
   chmod +x scripts/backup.sh
   ./scripts/backup.sh
   ```
