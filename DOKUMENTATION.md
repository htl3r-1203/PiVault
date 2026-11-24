# PiVault – Technische Dokumentation

Stand: 24.11.2026. Diese Dokumentation beschreibt **jede Datei** des Repositorys, ihre Aufgabe, ihre Imports und
Abhängigkeiten sowie die Zusammenhänge zwischen den Modulen. Sie basiert auf dem tatsächlichen Code, nicht auf der
Planung. Wo Planung und Code auseinanderliegen, ist das ausdrücklich vermerkt.

> **Wichtigster Fakt vorab:** Es gibt im gesamten Repository **noch keinen Code für die clientseitige
> Verschlüsselung** und keine Tresor-API. Verschlüsselt/gesichert ist heute nur die *Anmeldung* (Argon2id, Sessions,
> CSRF, TLS-Option). Die Datenbank ist für die spätere Verschlüsselung vorbereitet, aber die Tabellen `vaults` und
> `vault_entries` werden von keinem Code beschrieben. Die Tresor-Oberfläche im Frontend arbeitet mit Demo-Daten im
> Arbeitsspeicher (Details in Abschnitt 4 und 5).

## Inhaltsverzeichnis

1. [Architektur im Überblick](#1-architektur-im-überblick)
2. [Core-Funktionen](#2-core-funktionen)
3. [Verschlüsselung und Sicherheit: wer ist wofür verantwortlich?](#3-verschlüsselung-und-sicherheit-wer-ist-wofür-verantwortlich)
4. [Datenflüsse](#4-datenflüsse)
5. [Dateien im Detail](#5-dateien-im-detail)
   - [5.1 Wurzelverzeichnis](#51-wurzelverzeichnis)
   - [5.2 database/](#52-database)
   - [5.3 scripts/](#53-scripts)
   - [5.4 backend/](#54-backend)
   - [5.5 frontend/ (Konfiguration)](#55-frontend-konfiguration)
   - [5.6 frontend/src/ (Anwendung)](#56-frontendsrc-anwendung)
6. [Import- und Abhängigkeitsgraphen](#6-import--und-abhängigkeitsgraphen)
7. [Wo die Verschlüsselung später andockt](#7-wo-die-verschlüsselung-später-andockt)
8. [Bekannte Lücken und Hinweise](#8-bekannte-lücken-und-hinweise)

---

## 1. Architektur im Überblick

```
 Browser (Vue 3 SPA, TypeScript)
    │  HTTP :8080 / HTTPS :8443 (nur wenn ssl/fullchain.pem + privkey.pem vorhanden)
    ▼
┌─────────────────────────────┐   frontend-net   ┌──────────────────────────┐   backend-net (internal)   ┌───────────────────┐
│ Container "frontend"        │ ───────────────► │ Container "backend"      │ ─────────────────────────► │ Container         │
│ Apache httpd 2.4            │   /api → :8000   │ FastAPI + Uvicorn        │   SQLAlchemy + PyMySQL     │ "database"        │
│ • liefert dist/ aus (SPA)   │                  │ • Auth, Sessions, CSRF   │                            │ MariaDB 11.4      │
│ • TLS, CSP, Security-Header │                  │ • Rate-Limit, Hashing    │                            │ • users, sessions │
│ • Reverse Proxy für /api    │                  │ • (Tresor-API fehlt noch)│                            │ • vaults, entries │
└─────────────────────────────┘                  └──────────────────────────┘                            └───────────────────┘
```

**Netzwerksegmentierung (`compose.yaml`):**

| Netz | Eigenschaft | Teilnehmer |
|---|---|---|
| `frontend-net` | normales Bridge-Netz | `frontend`, `backend` |
| `backend-net` | `internal: true` (kein Zugang nach außen) | `backend`, `database` |

Apache erreicht FastAPI, FastAPI erreicht MariaDB, **Apache erreicht MariaDB nicht**. Nur Apache veröffentlicht Ports am
Host (`WEB_PORT`→80, `WEB_SSL_PORT`→443); Backend (`expose: 8000`) und Datenbank sind von außen nicht erreichbar.

**Technologie-Stack (laut `CLAUDE.md` verbindlich):** Vue 3 + TypeScript + Vite (nur Build), Vue Router, Apache,
Python/FastAPI/Pydantic/SQLAlchemy (PyMySQL), MariaDB, Docker Compose. Zielsystem Raspberry Pi 5 (ARM64).

**Zero-Knowledge-Prinzip (Soll-Zustand):** Ver-/Entschlüsselung und Schlüsselverwaltung finden ausschließlich im
Browser statt. Das Masterpasswort verlässt nie den Browser. Der Server speichert nur Chiffretext. Login-Passwort und
Masterpasswort sind vollständig getrennt (Abschnitt 3).

---

## 2. Core-Funktionen

Das sind die Funktionen, an denen das System fachlich und sicherheitstechnisch hängt. Alles andere ist Verdrahtung,
Darstellung oder Konfiguration.

### Backend

| Funktion / Klasse | Datei | Aufgabe |
|---|---|---|
| `hash_password`, `verify_password`, `verify_dummy_password` | `backend/app/core/security.py` | Argon2id-Hashing und -Prüfung des **Login**-Passworts; Dummy-Prüfung gleicht die Antwortzeit bei unbekanntem Benutzer an |
| `generate_session_token`, `hash_session_token` | `backend/app/core/security.py` | 32-Byte-Zufallstoken, in der DB nur SHA-256-Hash |
| `csrf_token_for`, `tokens_equal` | `backend/app/core/security.py` | CSRF-Token als HMAC aus dem Session-Token; zeitkonstanter Vergleich |
| `authenticate`, `get_auth` | `backend/app/api/deps.py` | Zentrale Zugangskontrolle: Cookie → Session → Ablauf/Inaktivität → Konto → CSRF. **Jede künftige geschützte Route hängt an `Depends(get_auth)`** |
| `verify_same_origin` | `backend/app/api/deps.py` | Globale Origin-Prüfung gegen Cross-Site-Schreibzugriffe |
| `register`, `login`, `me`, `logout` | `backend/app/api/auth.py` | Die vier Auth-Endpunkte (`/api/auth/...`) |
| `RateLimiter` (`check_rate_limit`, `is_blocked`, `record_event`, `clear`) | `backend/app/core/rate_limit.py` | Sliding-Window-Limiter für Login/Registrierung und die IP+Benutzer-Fehlversuchsbremse |
| `ContentSizeLimitMiddleware`, `SecurityHeadersMiddleware` | `backend/app/core/middleware.py` | Größenlimit (413) und Sicherheitsheader |
| `RegisterIn`, `LoginIn`, `UserOut` | `backend/app/schemas/auth.py` | Eingabevalidierung und Ausgabe-Schema (kein Hash, keine Schlüsselfelder in der Antwort) |
| `get_engine`, `get_db` | `backend/app/db/session.py` | Lazy-Engine, Connection-Pool, Session pro Request |
| `User`, `Vault`, `VaultEntry`, `Session` | `backend/app/db/models.py` | ORM-Modelle, spiegeln `database/schema.sql` |

### Frontend

| Funktion / Modul | Datei | Aufgabe |
|---|---|---|
| `api` (`get`, `post`), `request`, `setCsrfToken`, `setUnauthorizedHandler` | `frontend/src/services/api.ts` | Einziger Fetch-Client; hängt `X-CSRF-Token` an schreibende Requests, behandelt 401 |
| `authState`, `loadUser`, `login`, `register`, `logout`, `clearUser` | `frontend/src/services/auth.ts` | Sitzungsstatus nur im Arbeitsspeicher, Auth-Aufrufe |
| Router-Guard `beforeEach` | `frontend/src/router/index.ts` | Erzwingt `requiresAuth` / `guestOnly` anhand von `/api/auth/me` |
| `generatePassword`, `randomInt` | `frontend/src/services/passwordGenerator.ts` | Passwortgenerator mit `crypto.getRandomValues` und Rejection Sampling (die einzige Krypto-Zufallsquelle im Frontend) |
| `VaultRepository` (Interface) | `frontend/src/services/vault/vaultRepository.ts` | **Die Naht für die spätere Verschlüsselung** (Abschnitt 7) |
| `useVault` | `frontend/src/composables/useVault.ts` | Zentraler Tresor-Zustand der UI; verwirft alle Daten beim Abmelden |

### Infrastruktur

| Element | Datei | Aufgabe |
|---|---|---|
| Netzsegmentierung, Härtung der Container | `compose.yaml` | `internal`-Netz, `cap_drop: ALL`, `read_only`, `tmpfs`, Ressourcenlimits, Logrotation |
| TLS, CSP, Header, Proxy, SPA-Fallback | `frontend/apache.conf` | Alle webserverseitigen Sicherheitsmaßnahmen |
| Schema mit Constraints | `database/schema.sql` | Struktur, die Nonce-/Tag-/Hash-Längen erzwingt |
| Least-Privilege-Rechte | `database/privileges.sh` | Anwendungsbenutzer darf nur SELECT/INSERT/UPDATE/DELETE |
| Backup/Restore mit Prüfsumme | `scripts/backup.sh`, `scripts/restore.sh` | Konsistente, verifizierte Sicherung und Wiederherstellung |

---

## 3. Verschlüsselung und Sicherheit: wer ist wofür verantwortlich?

### 3.1 Die zwei getrennten Geheimnisse

| | **Login-Passwort** | **Masterpasswort** |
|---|---|---|
| Zweck | Anmeldung am Server | Entschlüsselung des Tresors |
| Wohin gesendet | an `POST /api/auth/login` bzw. `/register` | **nie** an den Server |
| Gespeichert | als Argon2id-Hash in `users.password_hash` | **nirgends**; nur Salt, KDF-Parameter und der damit verschlüsselte Tresorschlüssel |
| Implementiert | **ja** (`security.py`, `auth.py`) | **nein** (nur Felder in `users` und Hinweistexte in der UI) |
| Frontend-UI | `LoginView`, `RegisterView` | `SettingsView` zeigt es als „Noch nicht verfügbar“ |

### 3.2 Geplante Schlüsselhierarchie (Schema vorbereitet, Code fehlt)

```
Masterpasswort ──Argon2id(Salt, m/t/p)──► KEK (Key Encryption Key, 256 Bit)   ← nur im Browser, nur im RAM
                                           │ AES-256-GCM
Zufälliger Tresorschlüssel (Vault Key) ────┴──► encrypted_vault_key + vault_key_nonce + vault_key_tag   (in users)
Vault Key ──AES-256-GCM──► Eintragsdaten (JSON) → vault_entries.encrypted_data + nonce + auth_tag
Vault Key ──AES-256-GCM──► Tresorname/-beschreibung → vaults.encrypted_name/… + nonce + tag
```

Masterpasswort ändern = nur den Vault Key neu verschlüsseln, die Einträge bleiben unberührt. Das Schema erzwingt per
`CHECK`: Nonce = 12 Byte, Tag = 16 Byte, `encrypted_vault_key` = 32 Byte, Salt 16–32 Byte, und dass die fünf
Schlüsselfelder in `users` entweder alle `NULL` oder alle gesetzt sind.

### 3.3 Verantwortlichkeitsmatrix

**Legende:** ✅ umgesetzt · 🟡 vorbereitet (Schema/Interface) · ❌ nicht vorhanden

| Aufgabe | Wo | Status |
|---|---|---|
| **Clientseitige Verschlüsselung der Tresordaten (AES-256-GCM)** | – (Web Crypto im Browser) | ❌ kein Code |
| **Schlüsselableitung Masterpasswort → KEK (Argon2id-WASM)** | – | ❌ kein Code; CSP erlaubt bereits `'wasm-unsafe-eval'` |
| Speicherung verschlüsselter Schlüssel/Einträge | `database/schema.sql`, `db/models.py` | 🟡 Tabellen und Constraints vorhanden, kein Code schreibt sie |
| Trennung Login-/Masterpasswort | Schema, `auth.py`-Docstring, UI-Hinweistexte | ✅ Konzept eingehalten; `UserOut` enthält keine Schlüsselfelder |
| **Login-Passwort-Hashing** (Argon2id, 64 MiB, NFKC-Normalisierung) | `core/security.py` → `hash_password`, `verify_password` | ✅ |
| Schutz vor Benutzer-Enumeration (Dummy-Hash, einheitliche Fehlermeldung, gleiche Antwortzeit) | `security.py` → `verify_dummy_password`, `auth.py` → `login` | ✅ |
| Begrenzung gleichzeitiger Hash-Operationen (RAM-Schutz auf dem Pi) | `security.py` → `_hash_slots` (`BoundedSemaphore`, Standard 4) | ✅ |
| **Session-Tokens** (32 Byte `secrets.token_urlsafe`, nur SHA-256-Hash in DB) | `security.py` → `generate_session_token`, `hash_session_token` | ✅ |
| Session-Ablauf (absolut 480 min, Inaktivität 30 min), serverseitiger Widerruf | `deps.py` → `authenticate`, `auth.py` → `logout` | ✅ |
| **Session-Cookie** (`HttpOnly`, `SameSite=Lax`, `Secure` per `COOKIE_SECURE`) | `deps.py` → `set_session_cookie` | ✅ (`Secure` nur bei `COOKIE_SECURE=true`, Standard `false`) |
| **CSRF-Schutz** (HMAC-SHA256 aus Session-Token, Header `X-CSRF-Token`, in `get_auth` für alle schreibenden Methoden) | `security.py` → `csrf_token_for`; `deps.py` → `_check_csrf`; Frontend `api.ts` | ✅ |
| Same-Origin-Prüfung für schreibende Requests (Origin vs. Host/CORS-Liste) | `deps.py` → `verify_same_origin`, global in `main.py` | ✅ |
| **Rate-Limiting** (Login 5/min je IP, Registrierung 3/5 min je IP) | `rate_limit.py`, `auth.py` | ✅ (nur im RAM, ein Worker) |
| **Brute-Force-Bremse ohne Aussperr-DoS** (je Client-IP + Benutzername, nie je Konto; `locked_until` nur manuell) | `auth.py` → `_failure_key`, `login` | ✅ |
| Client-IP-Ermittlung hinter Apache (letzter `X-Forwarded-For`-Eintrag; IPv6 → /64) | `auth.py` → `_client_ip`, `_rate_limit_ip` | ✅ |
| Eingabevalidierung (Strict-Schemas, `extra="forbid"`, Längen, Steuerzeichen, E-Mail) | `schemas/auth.py` | ✅ |
| Fehlerbehandlung ohne Datenleck (422 ohne Eingabewerte, 500 generisch) | `main.py` Exception-Handler | ✅ |
| Host-Header-Validierung | `main.py` → `TrustedHostMiddleware`, `ALLOWED_HOSTS` | ✅ |
| Request-Größenlimit (1 MB Backend, 10 MB Apache) | `middleware.py`, `apache.conf` (`LimitRequestBody`) | ✅ |
| Sicherheitsheader API (`nosniff`, `X-Frame-Options`, `Referrer-Policy`) | `middleware.py` → `SecurityHeadersMiddleware` | ✅ |
| Sicherheitsheader/CSP Webserver (CSP ohne `unsafe-inline`, HSTS bei TLS, COOP/CORP, Permissions-Policy) | `frontend/apache.conf` | ✅ |
| **TLS 1.2/1.3**, starke Cipher-Suites, Session-Tickets aus, HTTP→HTTPS-Redirect | `apache.conf` (aktiv, sobald Zertifikat in `ssl/` liegt), `compose.yaml` (Mount `./ssl`) | ✅ (ohne Zertifikat läuft nur HTTP) |
| TRACE deaktiviert, Server-Version verborgen, kein Directory-Listing | `apache.conf` | ✅ |
| Least-Privilege-DB-Benutzer (kein DDL) | `database/privileges.sh` | ✅ |
| DB-Passwort aus Datei (Docker Secrets) | `config.py` → `resolved_db_password` | ✅ |
| Container-Härtung (`no-new-privileges`, `cap_drop: ALL`, `read_only`, `tmpfs noexec`, Limits, Nicht-Root-Backend) | `compose.yaml`, `backend/Dockerfile` | ✅ |
| Verifizierte Backups (SHA-256, Vollständigkeitsprüfung, `umask 077`, Pre-Restore-Sicherung) | `scripts/backup.sh`, `scripts/restore.sh` | ✅ |
| Kryptografisch sichere Passwortgenerierung (Browser) | `services/passwordGenerator.ts` | ✅ (`crypto.getRandomValues`, unverzerrt) |
| XSS-Härtung im Frontend (kein `v-html`, nur `http(s)`-Links, CSP) | `utils/url.ts`, `EntryDetail.vue`, `apache.conf` | ✅ |
| Keine sensiblen Daten im Browser-Speicher (CSRF-Token nur im RAM; localStorage nur für Theme/Sidebar) | `api.ts`, `preferences.ts` | ✅ |
| Secure-Context-Behandlung (Clipboard-API) | `services/clipboard.ts` | ✅ (Fehlermeldung statt Absturz) |

### 3.4 Was die Sicherheit **nicht** abdeckt (Stand heute)

- Tresordaten sind **nirgends** verschlüsselt, weil es keine echten Tresordaten gibt. Würde man sie jetzt unverschlüsselt
  an eine API senden, wäre das Zero-Knowledge-Prinzip verletzt.
- Über HTTP (ohne Zertifikat) sind Session-Cookie und Login-Passwort im Netz lesbar. HTTPS ist optional, nicht erzwungen.
- Web Crypto (`crypto.subtle`) existiert nur in sicheren Kontexten (HTTPS/localhost). Die spätere Verschlüsselung setzt
  deshalb HTTPS voraus.
- Der Rate-Limiter ist prozesslokal (siehe Abschnitt 8).

---

## 4. Datenflüsse

### 4.1 Registrierung

1. `RegisterView.vue` validiert clientseitig (gleiche Regeln wie das Backend) und ruft `register()` aus `services/auth.ts`.
2. `auth.ts` → `api.post('/api/auth/register', payload)` (`api.ts`, kein CSRF-Token nötig: noch keine Session).
3. Apache leitet `/api/...` an `backend:8000` weiter und setzt `X-Forwarded-Proto/-Port`.
4. FastAPI: Middleware-Kette (siehe 5.4, `main.py`), globale Abhängigkeit `verify_same_origin`, dann `auth.register`.
5. `RegisterIn` validiert (Strict, Längen, E-Mail normalisiert), Rate-Limit je IP, `hash_password` (Argon2id),
   `INSERT` in `users`. Doppelte Daten ergeben 409 mit bewusst unspezifischer Meldung.
6. Antwort 201 mit `UserOut`; das Frontend leitet auf `/login?registered=1`.

### 4.2 Anmeldung

1. `LoginView.vue` → `login(identifier, password)` → `POST /api/auth/login`.
2. `auth.login`: IP-Limit (5/min) → Fehlversuchsbremse (IP + Benutzer) → Benutzer-Lookup (Benutzername **oder** E-Mail) →
   `verify_password` bzw. `verify_dummy_password` → Kontostatus (`user_can_login`) → Zähler zurücksetzen →
   alte Session des Browsers und abgelaufene Sessions löschen → neue Session mit `token_hash` anlegen.
3. Antwort: Cookie `pivault_session` (HttpOnly) und im Body `user` + `csrf_token`.
4. `auth.ts` speichert **nur im Arbeitsspeicher**: `authState.user` und per `setCsrfToken` das CSRF-Token (`api.ts`).
5. `LoginView` leitet auf das (validierte, nur interne) `redirect`-Ziel oder `/`.

### 4.3 Geschützter Request (Beispiel `GET /api/auth/me`, künftig auch Tresor-Endpunkte)

1. Browser sendet automatisch das Cookie. Bei schreibenden Methoden zusätzlich `X-CSRF-Token` (`api.ts`).
2. `Depends(get_auth)` → `authenticate`: Cookie lesen → `token_hash` berechnen → Session samt User laden →
   absolutes Ablaufdatum und Inaktivitäts-Timeout prüfen (abgelaufen = Zeile löschen, 401 + Cookie löschen) →
   `user_can_login` → bei schreibenden Methoden `_check_csrf` → `last_activity` höchstens einmal pro Minute schreiben.
3. Bei 401 auf einem Endpunkt außerhalb von `/api/auth/` ruft `api.ts` den `unauthorizedHandler` (`main.ts`): lokalen
   Zustand verwerfen und zu `/login?redirect=…` navigieren.

### 4.4 Abmeldung

`SidebarNav.vue` → `logout()` → `POST /api/auth/logout` (mit CSRF) → Session-Zeile wird gelöscht, Cookie entfernt.
`auth.ts` verwirft den lokalen Zustand in jedem Fall (`finally`). `useVault.ts` beobachtet `authState.user` und leert
daraufhin alle Tresordaten im Speicher.

### 4.5 Demo-Eintrag anlegen (heute)

`HomeView` → `EntryFormDialog` → `EntryForm` (Validierung) → `HomeView.saveEntry` → `useVault.createEntry` →
`VaultRepository.createEntry` (Implementierung: `demoVaultRepository`, nur Array im RAM). **Kein Netzwerkzugriff, kein
Browser-Speicher, keine Verschlüsselung.** Neuladen setzt alles zurück.

### 4.6 Eintrag speichern (Zielzustand, noch nicht gebaut)

Formular → `EncryptedVaultRepository.createEntry`: Eintrag als JSON → AES-256-GCM mit dem im RAM gehaltenen Vault Key
(frische 12-Byte-Nonce) → `POST /api/vault/...` mit `encrypted_data`, `nonce`, `auth_tag` (+ `is_favorite`) → Backend
prüft Besitzer und Längen und speichert Binärdaten. Beim Laden läuft der Weg umgekehrt im Browser.

---

## 5. Dateien im Detail

Schreibweise: **Imports** = was die Datei selbst einbindet; **Genutzt von** = wer sie einbindet oder ausführt.

### 5.1 Wurzelverzeichnis

#### `compose.yaml`
Definiert die drei Dienste, zwei Netze und das Volume `pivault_db_data` (Projektname `pivault`).

| Dienst | Image/Build | Ports | Netze | Besonderheiten |
|---|---|---|---|---|
| `frontend` | `./frontend` (Apache) | `${WEB_PORT:-8080}:80`, `${WEB_SSL_PORT:-8443}:443` | `frontend-net` | Mount `./ssl` → `/usr/local/apache2/conf/ssl` (read-only); `WEB_SSL_PORT` als Umgebungsvariable für den HTTPS-Redirect; wartet auf gesunden Backend-Container |
| `backend` | `./backend` (FastAPI) | `expose: 8000` (nicht veröffentlicht) | `frontend-net`, `backend-net` | Konfiguration aus `.env`; wartet auf gesunde Datenbank |
| `database` | `mariadb:11.4` | keine | nur `backend-net` | mountet `schema.sql` (als `01-schema.sql`) und `privileges.sh` (als `02-privileges.sh`) nach `/docker-entrypoint-initdb.d/` |

Härtung (für alle Dienste): `security_opt: no-new-privileges`, `cap_drop: ALL` mit gezielten `cap_add`
(Frontend: `NET_BIND_SERVICE`, `SETUID`, `SETGID`, `DAC_READ_SEARCH` für den privaten TLS-Schlüssel mit Rechten 0600;
Datenbank: `SETUID`, `SETGID`, `DAC_OVERRIDE`), Ressourcenlimits (`mem_limit`/`cpus`), `json-file`-Logrotation
(10 MB × 3), `restart: unless-stopped`. Frontend und Backend laufen `read_only: true` mit `tmpfs` für `/tmp` (und
Apache-Logs). Healthchecks: Frontend ruft `/api/health` über Apache ab, Backend ruft den Health-Endpunkt direkt ab,
Datenbank nutzt `healthcheck.sh`.
**Zusammenhang:** liest Variablen aus der Root-`.env` (Vorlage `.env.example`); baut `frontend/Dockerfile` und
`backend/Dockerfile`; bindet `database/schema.sql`, `database/privileges.sh` und `ssl/` ein.

#### `.env.example`
Vorlage für die (nicht versionierte) `.env`: `WEB_PORT`, `WEB_SSL_PORT`, `ALLOWED_HOSTS`, `CORS_ORIGINS`, `DOCS_ENABLED`,
`COOKIE_SECURE`, `SESSION_LIFETIME_MINUTES`, `SESSION_IDLE_TIMEOUT_MINUTES`, `RATE_LIMIT_ENABLED`, `MARIADB_*`,
optional `DB_PASSWORD_FILE`. Die Werte gelangen über `compose.yaml` als Umgebungsvariablen in die Container; im Backend
liest sie `app/core/config.py`. **Genutzt von:** `compose.yaml`. Enthält nur Platzhalter (`BITTE_AENDERN`).

#### `.gitignore`
Standard-Python-/Node-Ignore plus `.env`, `.env.*`, Zertifikate usw. Verhindert, dass Zugangsdaten ins Repository
gelangen.

#### `README.md`
Projektbeschreibung, Start-Anleitung, Migrationsablauf, Konfigurationstabelle. **Achtung: teilweise veraltet.** Sie
behauptet noch, Registrierung/Anmeldung und HTTPS seien nicht umgesetzt; beides existiert inzwischen (Abschnitt 8).

#### `CLAUDE.md`
Entwicklungsregeln für das Projekt (Stack, Docker-Pflicht, Zero-Knowledge, keine Git-Aktionen durch den Assistenten,
Planungsdokumente nur auf Auftrag ändern). Kein Laufzeitbestandteil.

#### `ssl/.gitkeep`
Platzhalter, damit das Verzeichnis `ssl/` existiert. Hier legt man `fullchain.pem` und `privkey.pem` ab; sobald beide
vorhanden sind, aktiviert `apache.conf` HTTPS. **Genutzt von:** `compose.yaml` (Mount).

#### `docs/`
Planungsdokumente (`PiVault_API-Planung.docx`, `…-Programmiersprache_auswählen.docx`, `PiVault-ER-Modell.pdf`,
`PiVault_sicherheitskonzept_entwickeln.docx`, `PiVault_verschluesselungs-konzept_entwickeln.docx`). Laut `CLAUDE.md`
nur auf ausdrücklichen Auftrag zu ändern; sie sind nicht Teil dieser Dateidokumentation.

---

### 5.2 `database/`

#### `database/schema.sql`
Maßgebliche Quelle für das Schema (MariaDB, InnoDB, `utf8mb4`). Wird beim **ersten** Start eines leeren Volumes
automatisch ausgeführt. Vier Tabellen:

| Tabelle | Zweck | Wichtige Spalten / Constraints |
|---|---|---|
| `users` | Konten | `username` (UNIQUE), `email` (UNIQUE), `password_hash` (Argon2id), Schlüsselfelder `master_kdf_salt` (16–32 B), `master_kdf_params` (JSON mit `v`), `encrypted_vault_key` (32 B), `vault_key_nonce` (12 B), `vault_key_tag` (16 B) – alle `NULL` oder alle gesetzt; `account_status`, `locked_until`, `email_verified_at`, `last_login_at` |
| `vaults` | Tresore je Benutzer | `FK_user_id` (CASCADE), `encrypted_name` + `name_nonce` (12) + `name_tag` (16), optional `encrypted_description` + Nonce/Tag (alle gemeinsam oder alle `NULL`) |
| `vault_entries` | Einträge je Tresor | `FK_vault_id` (CASCADE), `encrypted_data` (MEDIUMBLOB), `nonce` (12), `auth_tag` (16), unverschlüsselt: `is_favorite`, `sort_order`, `last_accessed_at`, `deleted_at` (Soft Delete) |
| `sessions` | Serverseitige Sitzungen | `token_hash` (32 B, UNIQUE, SHA-256), `ip_address`, `user_agent`, `created_at`, `expires_at` (> `created_at`), `last_activity`; Indizes auf `FK_user_id`, `last_activity`, `expires_at` |

Alle Längen werden per `CHECK` erzwungen. Die Datei enthält ausführliche Kommentare zum Key-Wrapping.
**Zusammenhang:** `backend/app/db/models.py` muss dazu passen (Spaltennamen, Typen, Constraints; die Namenskonvention in
`db/base.py` erzeugt dieselben Constraint-Namen). Eingebunden von `compose.yaml`; von `backend/tests/conftest.py`
implizit vorausgesetzt (Testdatenbank `pivault_test`). Neuinstallationen bekommen `users.locked_until` direkt aus
dieser Datei; für bestehende Datenbanken siehe die Anmerkung bei der Migration 001.

#### `database/migrations/001_auth_keys_sessions.sql`
Änderungsskript für **bestehende** Datenbanken (kein Alembic). Idempotent (`IF NOT EXISTS`/`IF EXISTS`), löscht keine
Tabellen: ergänzt die fünf Schlüsselfelder in `users`, zusätzliche Constraints für `vaults`/`vault_entries`, in
`sessions` die Spalten `token_hash`, `created_at`, `expires_at` (alte Zeilen bekommen einen zufälligen Hash und gelten
sofort als abgelaufen) und entfernt die unbenutzte Klartext-Spalte `payload`. Ausführung und Backup-Hinweis stehen im
Kopfkommentar und in der `README.md`. **Hinweis:** Die Spalte `users.locked_until` kommt in dieser Migration **nicht** vor. Das Backend liest sie bei jeder
Anmeldung (`User`-Modell). Ob der Ausgangsstand einer bestehenden Datenbank sie schon hatte, lässt sich aus dem Repo nicht
ableiten. Prüfen mit
`docker compose exec -T database sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE" -e "SHOW COLUMNS FROM users LIKE '"'"'locked_until'"'"'"'`
(leere Ausgabe = Spalte fehlt, Migration ergänzen; siehe Abschnitt 8).

#### `database/privileges.sh`
Shell-Skript, das beim Initialisieren (nach `01-schema.sql`) dem Anwendungsbenutzer alle Rechte entzieht und nur
`SELECT, INSERT, UPDATE, DELETE` auf die Anwendungsdatenbank gewährt (kein `CREATE`/`ALTER`/`DROP`). Nutzt die
`MARIADB_*`-Umgebungsvariablen des Containers; das Root-Passwort geht über `MYSQL_PWD`, nicht über die Kommandozeile.
Für bestehende Datenbanken einmalig per `docker compose exec database sh /docker-entrypoint-initdb.d/02-privileges.sh`.
**Folge:** Schemaänderungen müssen als `root` laufen (so wie die Migration), nicht über die App.

---

### 5.3 `scripts/`

#### `scripts/backup.sh`
Konsistentes Datenbank-Backup: `docker compose exec -T database … mariadb-dump --single-transaction --quick` →
`gzip -9` in eine `.partial`-Datei → Prüfung (gzip-Integrität und Abschlusszeile `-- Dump completed`) → erst dann
Umbenennung → SHA-256-Datei (`<datei>.sha256`, Dateiname ohne Pfad) → Rotation (älter als 14 Tage, mindestens 3 bleiben).
`umask 077`, Verzeichnis `700`, Passwort nur über `MYSQL_PWD` im Container. `trap` entfernt unvollständige Dateien.
**Aufruf:** `bash scripts/backup.sh [zielverzeichnis]` (Standard `./backups`). **Genutzt von:** manuell und von
`restore.sh` (Pre-Restore-Sicherung).

#### `scripts/restore.sh`
Stellt ein Backup wieder her. Ablauf: (1) SHA-256 der Datei gegen die `.sha256`-Datei prüfen (ohne Prüfsumme nur mit
`ALLOW_UNVERIFIED=1`), (2) gzip-Integrität und Abschlusszeile prüfen, **bevor** die Datenbank angefasst wird,
(3) Sicherheitsabfrage („JA“), (4) Sicherung des aktuellen Stands über `backup.sh` nach `./backups/pre-restore`
(Abbruch, falls das scheitert), (5) Einspielen per `gunzip | docker compose exec -T database mariadb`. Warnt, wenn das
Backend noch läuft. **Imports/Abhängigkeiten:** ruft `scripts/backup.sh` auf; benötigt `docker compose` und die
Container-Umgebungsvariablen `MARIADB_DATABASE`, `MARIADB_ROOT_PASSWORD`.
**Wichtig:** Ein Restore ersetzt alle Tabellen inkl. Struktur. Vorher Backend und Frontend stoppen.

---

### 5.4 `backend/`

#### Build- und Konfigurationsdateien

| Datei | Inhalt |
|---|---|
| `backend/Dockerfile` | `python:3.13-slim`, installiert `requirements.txt`, kopiert `app/`, legt Systembenutzer `pivault` an und startet als dieser `uvicorn app.main:app` auf `0.0.0.0:8000`. `PYTHONDONTWRITEBYTECODE=1` (wichtig wegen `read_only`-Dateisystem) |
| `backend/.dockerignore` | schließt `.venv`, `__pycache__`, `*.pyc`, `.env` aus dem Build-Kontext aus |
| `backend/requirements.txt` | `fastapi`, `pydantic-settings`, `PyMySQL`, `SQLAlchemy`, `uvicorn[standard]`, `argon2-cffi`, `email-validator` (alles exakt gepinnt) |
| `backend/requirements-dev.txt` | bindet `requirements.txt` ein, ergänzt `pytest`, `httpx` (TestClient) |
| `backend/pytest.ini` | `testpaths = tests`, `pythonpath = .` (damit `import app…` funktioniert) |

#### `backend/app/main.py` – Einstiegspunkt
Erzeugt die FastAPI-Instanz und verdrahtet alles.

- **Imports:** `app.api.auth`, `app.api.health` (Router), `app.api.deps.verify_same_origin`, `app.core.config.settings`,
  `app.core.middleware` (beide Middlewares), Starlette `TrustedHostMiddleware`, FastAPI `CORSMiddleware`.
- `docs_url`/`redoc_url`/`openapi_url` nur bei `DOCS_ENABLED=true`; `debug=False`.
- **Globale Abhängigkeit** `verify_same_origin` für alle Routen.
- **Middleware-Reihenfolge:** Im Code stehen sie in der Reihenfolge 1–4 (SecurityHeaders, ContentSizeLimit,
  TrustedHost, CORS). Starlette stapelt zuletzt hinzugefügte Middleware nach außen, die tatsächliche **Ausführung eines
  Requests** ist daher: CORS → TrustedHost → ContentSizeLimit → SecurityHeaders → Anwendung.
- **Exception-Handler:** `RequestValidationError` → 422 mit `[{field, message}]` **ohne** die eingegebenen Werte
  (kein Passwort in der Antwort); `Exception` → 500 `"Interner Serverfehler."` ohne Stack-Trace (Details nur im Log).
- **Router:** `health` und `auth`, jeweils mit Präfix `/api`.
- **Genutzt von:** Uvicorn (`app.main:app`) und `tests/conftest.py`.

#### `backend/app/core/config.py`
`Settings` (Pydantic-Settings) liest Umgebungsvariablen bzw. `backend/.env`; Singleton `settings`.
Felder: `cors_origins`, DB (`db_host/port/name/user/password/password_file`), `cookie_secure`,
`session_lifetime_minutes` (480), `session_idle_timeout_minutes` (30), `docs_enabled`, `allowed_hosts`,
`rate_limit_enabled`, `rate_limit_login_per_minute` (5), `rate_limit_register_per_5_minutes` (3), `max_failed_logins` (5),
`account_lockout_minutes` (15, Fenster der Fehlversuchsbremse), `max_concurrent_password_hashes` (4),
`max_request_body_bytes` (1 MiB). Properties: `resolved_db_password` (Datei hat Vorrang, z. B. Docker Secret),
`cors_origin_list`, `allowed_host_list`.
**Imports:** `pydantic_settings`, `pathlib`. **Genutzt von:** `main.py`, `security.py`, `deps.py`, `auth.py`, `session.py`.

#### `backend/app/core/security.py` – Kryptografie des Backends
Siehe Abschnitt 3. Bestandteile: `_hasher = PasswordHasher()` (argon2-cffi, Argon2id, Standardparameter 64 MiB),
`_hash_slots` (BoundedSemaphore gegen RAM-Erschöpfung), `utcnow()` (naives UTC passend zu `DATETIME`),
`_normalize` (NFKC), `hash_password`, `verify_password`, `verify_dummy_password` (+ gecachter `_dummy_hash`),
`generate_session_token`, `hash_session_token` (SHA-256, 32 Byte), `csrf_token_for` (HMAC-SHA256, Schlüssel =
Session-Token, Nachricht `pivault-csrf-v1`), `tokens_equal` (`hmac.compare_digest`).
**Imports:** `hashlib`, `hmac`, `secrets`, `threading`, `unicodedata`, `argon2`, `app.core.config.settings`.
**Genutzt von:** `api/auth.py`, `api/deps.py`. Das **Masterpasswort kommt hier nicht vor.**

#### `backend/app/core/middleware.py`
- `ContentSizeLimitMiddleware(app, max_bytes)`: prüft `Content-Length` und zählt gestreamte Chunks; Überschreitung →
  sofort 413 (JSON), danach werden weitere Antworten der App verworfen (`guarded_send`), damit FastAPI nicht ein 400 daraus macht.
- `SecurityHeadersMiddleware`: ergänzt `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, falls nicht schon gesetzt.
- **Imports:** `json`, Starlette-Typen. **Genutzt von:** `main.py`. (Apache entfernt diese drei Header für `/api`, setzt sie
  selbst und verhindert so Doppelungen.)

#### `backend/app/core/rate_limit.py`
Thread-sicherer Sliding-Window-Limiter im Arbeitsspeicher (`threading.Lock`, `deque` je Schlüssel).
Methoden: `check_rate_limit(key, max, window)` (zählt und prüft, liefert `(erlaubt, retry_after)`),
`is_blocked` (prüft ohne zu zählen), `record_event`, `clear`, `size`, `reset`; automatische Bereinigung alle 256 Aufrufe
(`PRUNE_EVERY`). Globales Singleton `rate_limiter`. Injizierbare `clock` macht ihn testbar.
**Genutzt von:** `api/auth.py`, Tests. **Grenze:** Zähler gehen bei Neustart verloren und sind pro Worker getrennt
(Docstring erklärt das; Standard-Deployment hat einen Worker).

#### `backend/app/api/auth.py`
Router `/api/auth` (alle Antworten `Cache-Control: no-store` über `Depends(no_store)`).

| Endpunkt | Zugriff | Ablauf |
|---|---|---|
| `POST /register` (201) | offen | IP-Rate-Limit → `User` mit `hash_password` anlegen → bei `IntegrityError 1062` 409 ohne Hinweis auf das betroffene Feld |
| `POST /login` | offen | siehe 4.2; antwortet 401 einheitlich, 429 (mit `Retry-After`), 403 bei gesperrtem Konto |
| `GET /me` | Session | liefert `user` und neues `csrf_token` (aus dem Session-Token berechnet) |
| `POST /logout` (204) | Session + CSRF | löscht die Session; ohne gültige Session wird nur das Cookie entfernt |

Hilfsfunktionen: `_user_out`, `_client_ip` (letzter `X-Forwarded-For`-Eintrag, den Apache anhängt; links davon stehende
Einträge sind client-kontrolliert und werden ignoriert), `_rate_limit_ip` (IPv6 → /64, IPv4-mapped → IPv4),
`_failure_key` (SHA-256 des Benutzernamens/E-Mail, IP-gebunden).
**Imports:** `app.api.deps` (Cookie-/Auth-Helfer), `app.core.config`, `app.core.rate_limit`, `app.core.security`,
`app.db.models` (`User`, `Session as UserSession`), `app.db.session.get_db`, `app.schemas.auth`, SQLAlchemy.
**Genutzt von:** `main.py`.

#### `backend/app/api/deps.py`
Gemeinsame Abhängigkeiten, **der Kern der Zugangskontrolle**: Konstanten `COOKIE_NAME = "pivault_session"`,
`CSRF_HEADER`, `SAFE_METHODS`; `AuthContext` (User, Session, rohes Token); `set_session_cookie`/`clear_session_cookie`
(`HttpOnly`, `SameSite=Lax`, `Secure` per Konfiguration); `user_can_login` (aktiv und nicht gesperrt);
`verify_same_origin`; `_check_csrf`; `authenticate`; `get_auth`; `no_store`.
**Wichtig für künftige Routen:** `get_auth` prüft bei `POST/PUT/PATCH/DELETE` automatisch das CSRF-Token.
**Imports:** `app.core.config`, `app.core.security`, `app.db.models`, `app.db.session.get_db`, SQLAlchemy `joinedload`.
**Genutzt von:** `auth.py`, `main.py`, `tests/conftest.py`.

#### `backend/app/api/health.py`
`GET /api/health`: `SELECT 1` gegen die Datenbank; 200 `{"status":"ok","database":"ok"}` oder 503
`{"status":"error","database":"unavailable"}` (Fehlerdetails nur im Log). **Imports:** `app.db.session.get_engine`.
**Genutzt von:** `main.py`, Docker-Healthchecks, `SettingsView.vue` (über `getHealth`).

#### `backend/app/schemas/auth.py`
Pydantic-Modelle. Basisklasse `_Strict` (`extra="forbid"`).
- `RegisterIn`: Benutzername `^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$`, Namen 1–100 Zeichen ohne Steuerzeichen,
  E-Mail (≤254, `email-validator`, normalisiert/kleingeschrieben), Passwort 12–128 Zeichen ohne Steuerzeichen.
- `LoginIn`: `identifier` (1–255), `password` (1–128).
- `UserOut`: `id`, `username`, `first_name`, `last_name`, `email`, `email_verified` – **ohne** Hash und Schlüsselfelder.
- `LoginOut`/`MeOut`: `user` + `csrf_token`.
**Hinweis:** Die Regeln spiegeln `RegisterView.vue` (dort nur für schnelles Feedback; verbindlich ist das Backend).

#### `backend/app/db/base.py`
`Base` (SQLAlchemy `DeclarativeBase`) mit fester `NAMING_CONVENTION` (`ix_`, `uq_`, `ck_`, `fk_`, `pk_`), passend zu den
Namen in `schema.sql`. **Genutzt von:** `models.py`.

#### `backend/app/db/session.py`
`get_engine()` (`lru_cache`, **lazy**: beim Import keine Verbindung, Backend startet auch ohne DB):
`mysql+pymysql`, `utf8mb4`, `pool_pre_ping`, `pool_size=5`, `max_overflow=10`, `pool_recycle=1800`,
`hide_parameters=True` (keine Werte in Fehlermeldungen), `connect_timeout=3`. `get_db()` ist die FastAPI-Dependency
(Session pro Request, `autoflush=False`, im `finally` geschlossen).
**Imports:** `app.core.config`. **Genutzt von:** `deps.py`, `auth.py`, `health.py`, Tests.

#### `backend/app/db/models.py`
ORM-Modelle `User`, `Vault`, `VaultEntry`, `Session` (Namenskollision mit `sqlalchemy.orm.Session` wird durch
`Session as UserSession` bei den Imports vermieden). Spiegeln `schema.sql` einschließlich `CheckConstraint`s;
Relationen mit `cascade="all, delete-orphan"` und `passive_deletes=True` (ON DELETE CASCADE der DB). Die
Schlüssel-/Tresorfelder sind abgebildet, aber **kein Code verwendet `Vault`/`VaultEntry` oder die `master_*`-Felder**.
**Imports:** `sqlalchemy` (+ MySQL-Dialekt `INTEGER`, `MEDIUMBLOB`), `app.db.base.Base`.
**Genutzt von:** `deps.py`, `auth.py`.

#### `backend/app/__init__.py`, `api/__init__.py`, `core/__init__.py`, `db/__init__.py`, `schemas/__init__.py`, `tests/__init__.py`
Leere Paketmarkierungen.

#### `backend/tests/` – Tests (94 Tests, echte MariaDB)

| Datei | Tests | Inhalt |
|---|---|---|
| `conftest.py` | – | Bricht ab, wenn die Datenbank nicht `pivault_test` heißt (Schutz vor Datenverlust). Fixtures `clean_db` (leert `users`, setzt Rate-Limiter zurück), `db` (Autocommit für Zeitmanipulation), `client`, `registered`, `logged_in`; Hilfsfunktion `user_payload`; registriert eine geschützte Testroute `/api/_test/protected` für alle Methoden |
| `test_auth.py` | 63 | `TestRegister`, `TestLogin`, `TestSession` (Ablauf/Inaktivität), `TestMe`, `TestLogout`, `TestCsrf`, `TestSecurityHelpers` |
| `test_lockout_dos.py` | 15 | Beweist: Fremde können Konten nicht sperren; Bremse gilt je (IP, Benutzername); IPv6-/64-Zusammenfassung; gefälschte `X-Forwarded-For`-Einträge werden ignoriert; Aufräumen ruhender Schlüssel |
| `test_security_hardening.py` | 14 | Rate-Limits, manuell gesperrtes Konto (403), 413 bei zu großem Body (auch gestreamt), generischer 500, Sicherheitsheader, deaktivierte Docs, Host-Validierung, DB-Passwort aus Datei, Begrenzung gleichzeitiger Argon2-Operationen |
| `test_health.py` | 2 | Health ok und 503 bei DB-Ausfall |

**Imports der Tests:** `app.main.app`, `app.api.deps`, `app.core.rate_limit`, `app.db.session`, `app.core.config`.

---

### 5.5 `frontend/` (Konfiguration)

| Datei | Inhalt und Zusammenhang |
|---|---|
| `frontend/Dockerfile` | Zweistufig. **Build:** `node:22-alpine`, `npm ci`, `npm run build` (= `vue-tsc --build` + `vite build`) erzeugt `dist/`. **Laufzeit:** `httpd:2.4-alpine`; kopiert `apache.conf` nach `conf/extra/pivault.conf`, aktiviert per `sed` die Module `proxy`, `proxy_http`, `rewrite`, `headers`, `ssl`, `socache_shmcb`, bindet die Konfiguration per `Include` ein und kopiert `dist/` nach `htdocs/`. Das gebaute Frontend ist damit **im Image** – nach Codeänderungen muss das Image neu gebaut werden (`docker compose up -d --build frontend`) |
| `frontend/apache.conf` | Siehe unten (Sicherheitskern des Webservers) |
| `frontend/package.json` | Abhängigkeiten `vue`, `vue-router`; Dev: `vite`, `@vitejs/plugin-vue`, `typescript`, `vue-tsc`, Typpakete. Skripte `dev`, `build`, `preview`, `type-check` (rufen die Tools über `node node_modules/…` auf). `engines: node ^22.18 \|\| >=24.12`. Keine UI- oder Krypto-Bibliothek |
| `frontend/package-lock.json` | exakte Versionen für `npm ci` |
| `frontend/vite.config.ts` | Plugin `vue()`, Alias `@` → `src/` (genutzt in allen `@/…`-Imports) |
| `frontend/tsconfig.json` | Projekt-Referenzen auf `tsconfig.node.json` und `tsconfig.app.json` |
| `frontend/tsconfig.app.json` | für `src/**`: `@vue/tsconfig/tsconfig.dom.json`, `noUncheckedIndexedAccess`, Pfad-Alias `@/*` |
| `frontend/tsconfig.node.json` | für `vite.config.ts` (Node 24, Bundler-Modus, `noEmit`) |
| `frontend/env.d.ts` | `/// <reference types="vite/client" />` (u. a. `import.meta.env`) |
| `frontend/index.html` | HTML-Gerüst: `lang="de"`, `<div id="app">`, lädt `/src/main.ts`; Meta `color-scheme` und `theme-color`. **Keine Inline-Skripte oder -Styles** (die CSP erlaubt sie nicht) |
| `frontend/public/favicon.ico` | Favicon |
| `frontend/.dockerignore`, `frontend/.gitignore` | schließen `node_modules`, `dist`, Logs, `.env*` aus |

#### `frontend/apache.conf` – Webserver-Sicherheit
- **Allgemein:** `ServerTokens Prod`, `ServerSignature Off`, `TraceEnable Off`, `LimitRequestBody 10485760` (10 MB).
- **Header für alle Antworten:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
  `Permissions-Policy` (Kamera, Mikrofon, Geolocation, Payment, USB aus), `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy: same-origin` und die **CSP:** `default-src 'none'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'`.
  *Konsequenzen für das Frontend:* keine Inline-Skripte/-Styles (`style="…"`), keine externen Schriften/CDNs; Argon2id-WASM
  ist über `'wasm-unsafe-eval'` bereits erlaubt.
- **Reverse Proxy:** `ProxyPass /api http://backend:8000/api` (+ `ProxyPassReverse`), `ProxyPreserveHost On` (wichtig für
  die Origin-Prüfung des Backends), `X-Forwarded-Proto/-Port`. Für `/api` werden die drei Header des Backends entfernt,
  damit sie nicht doppelt erscheinen.
- **SPA-Fallback:** `RewriteRule ^ /index.html [L]` für alles außer `/api` und existierende Dateien (Deep-Links wie
  `/favorites`).
- **TLS (nur `<IfFile …/fullchain.pem>`):** `Listen 443`; `SSLProtocol -all +TLSv1.2 +TLSv1.3`, AEAD-Cipher-Suites,
  `SSLSessionTickets off`, Session-Cache im `tmpfs`; virtueller Host :443 mit HSTS (`max-age=31536000;
  includeSubDomains`), `X-Forwarded-Proto https`; virtueller Host :80 leitet per 301 auf `https://%{SERVER_NAME}:${WEB_SSL_PORT}`
  um (Loopback-Zugriff auf `/api/health` ist ausgenommen, damit der Healthcheck funktioniert). Ohne Zertifikat startet
  Apache trotzdem und bedient nur HTTP.
- **Zusammenhang:** wird per `frontend/Dockerfile` ins Image kopiert; Zertifikate kommen über den Mount aus `compose.yaml`
  (`./ssl`); `WEB_SSL_PORT` kommt als Umgebungsvariable aus `compose.yaml`.

---

### 5.6 `frontend/src/` (Anwendung)

Die Anwendung ist in Schichten aufgebaut: **Views → Komponenten → Composable/Services → (Repository | API)**.
Komponenten kennen weder `fetch` noch Krypto; sie sprechen nur mit `useVault` und den Services.

#### Einstieg und Routing

| Datei | Aufgabe | Imports | Genutzt von |
|---|---|---|---|
| `main.ts` | Startet die App: lädt Styles (`tokens.css`, `base.css`, `ui.css`), ruft `initTheme()`, registriert den **Unauthorized-Handler** (bei 401: `clearUser()` und Weiterleitung zu `/login?redirect=…`, wenn die Route `requiresAuth` hat), mountet `App` mit dem Router | `vue`, `App.vue`, `router`, `services/api` (`setUnauthorizedHandler`), `services/auth` (`clearUser`), `services/preferences` (`initTheme`) | `index.html` |
| `App.vue` | nur `<RouterView />` | `vue-router` | `main.ts` |
| `router/index.ts` | Routen und **Guard**. Geschützter Bereich: Elternroute `/` mit `AppLayout` und `meta.requiresAuth`, Kinder `home` (`scope: 'all'`), `favorites` (`scope: 'favorites'`), `vaults`, `generator`, `settings`. Gastrouten `login`, `register` (`guestOnly`). Unbekannte Pfade → `home`. `beforeEach`: lädt bei Bedarf den Benutzer (`loadUser`), leitet Gäste auf `/login?redirect=…` und Angemeldete weg von Gastrouten | `vue-router`, `AppLayout`, sieben Views, `services/auth` (`authState`, `loadUser`) | `main.ts` |

Die Typen-Erweiterung `RouteMeta` (`requiresAuth`, `guestOnly`, `scope`) steht in `router/index.ts` und wird von
`HomeView.vue` (`route.meta.scope`) verwendet.

#### Services (Logik ohne UI)

| Datei | Aufgabe | Imports | Genutzt von |
|---|---|---|---|
| `services/api.ts` | **Einziger HTTP-Client.** `request<T>`: `credentials: 'same-origin'`, JSON, fügt `X-CSRF-Token` bei Nicht-GET hinzu (Token nur im RAM, `setCsrfToken`), wandelt Fehler in `ApiError` (Status, Meldung, `fieldErrors`) um, ruft bei 401 außerhalb von `/api/auth/` den `unauthorizedHandler`. Exporte: `api.get/post`, `ApiError`, `getHealth`, `setCsrfToken`, `setUnauthorizedHandler` | – | `auth.ts`, `main.ts`, `LoginView`, `RegisterView`, `SettingsView` |
| `services/auth.ts` | `authState` (reaktiv: `user`, `loaded`), `loadUser` (`GET /api/auth/me`), `login`, `register`, `logout`, `clearUser`; Typen `User`, `RegisterPayload`. **Speichert nichts im Browser-Speicher.** Beim Login/`me` wird das CSRF-Token an `api.ts` gereicht | `vue` (`reactive`), `api.ts` | `router`, `main.ts`, `useVault`, `SidebarNav`, `HomeView`, `SettingsView`, `LoginView`, `RegisterView` |
| `services/passwordGenerator.ts` | **Kryptografisch sicherer Generator.** `randomInt(max)`: Rejection Sampling auf `Uint32` (keine Modulo-Verzerrung) mit `crypto.getRandomValues`. `generatePassword(options)`: je gewählter Zeichenart mindestens ein Zeichen, Rest aus dem Gesamtpool, anschließend Fisher-Yates-Mischung (ebenfalls mit `randomInt`). Grenzen 8–128; Fehlerklasse `GeneratorError`. Zusätzlich `estimateEntropyBits`, `strengthOf`, `poolSize`. **`Math.random` wird nirgends verwendet** | – | `GeneratorView`, `StrengthMeter` |
| `services/clipboard.ts` | `copyToClipboard` (wirft verständliche Fehler bei fehlendem Secure Context/verweigertem Zugriff), `isClipboardAvailable` | – | `CopyButton`, `GeneratorView` |
| `services/preferences.ts` | Nicht sensible UI-Einstellungen im `localStorage` (Schlüssel `pivault.ui.theme`, `pivault.ui.sidebarCollapsed`), jeder Zugriff in `try/catch`. `themeState`, `initTheme`, `setTheme` (setzt `data-theme` auf `<html>`; „System“ folgt `prefers-color-scheme`), `getSidebarCollapsed/setSidebarCollapsed` | `vue` | `main.ts`, `SettingsView`, `AppLayout` |
| `services/vault/vaultRepository.ts` | **Interface `VaultRepository`** (`isDemo`, `isEncrypted`, `listVaults`, `listEntries`, `createEntry`, `updateEntry`, `setFavorite`, `deleteEntry`) – die Datenzugriffsschicht, an der später die Verschlüsselung hängt | `types/vault` | `index.ts`, `demoVaultRepository.ts` |
| `services/vault/demoVaultRepository.ts` | **Demo-Implementierung.** Feste, erfundene Beispieldaten (`example.com`/`.invalid`, Passwörter `DEMO-Passwort-00x`), alles nur im Arbeitsspeicher, kein Netzwerk, kein Browser-Speicher, **keine Verschlüsselung**. Gibt Kopien (`structuredClone`) zurück | `types/vault`, `vaultRepository` | `index.ts` |
| `services/vault/index.ts` | Einziger Ort, an dem die Implementierung gewählt wird (`createVaultRepository`) | `demoVaultRepository`, `vaultRepository` | `useVault.ts` |

#### Zustand und Typen

| Datei | Aufgabe | Imports | Genutzt von |
|---|---|---|---|
| `composables/useVault.ts` | Zentraler UI-Zustand (`status`: `idle`/`loading`/`ready`/`error`, `vaults`, `entries`) und Aktionen (`ensureLoaded`, `reload`, `createEntry`, `updateEntry`, `setFavorite`, `deleteEntry`, `vaultName`). Hält genau ein Repository. **Beobachtet `authState.user`: wird er `null`, werden Repository und Daten verworfen** | `vue`, `services/auth`, `services/vault`, `types/vault` | `AppLayout`, `SidebarNav`, `HomeView`, `VaultsView` |
| `types/vault.ts` | `Vault`, `VaultEntry`, `EntryDraft` (UI-Sicht auf entschlüsselte Daten) | – | Repository, `useVault`, Komponenten |
| `utils/url.ts` | `parseHttpUrl`, `safeHref`, `hostnameOf` – nur `http(s)` wird als Link/URL akzeptiert (Schutz vor `javascript:` u. Ä.) | – | `EntryDetail`, `EntryForm`, `EntryListItem` |
| `utils/format.ts` | `formatDateTime`, `formatDate`, `greeting`, `initialOf` (`de-AT`) | – | `EntryDetail`, `HomeView`, `SidebarNav`, `EntryListItem` |

#### Views (`views/`)

| Datei | Aufgabe | Wichtige Imports |
|---|---|---|
| `HomeView.vue` | Dashboard (`/` und `/favorites`): Begrüßung, Suche/Filter/Sortierung, Liste, Detail-Seitenpanel, Formular, Löschdialog, Lade-/Leer-/Fehlerzustände, Demo-Hinweis. Filter „Tresor“ liegt in der URL (`?vault=…`) | `useVault`, `authState`, `EntryToolbar`, `EntryList`, `EntryListSkeleton`, `EntryDetail`, `EntryFormDialog`, `ConfirmDialog`, `BaseDialog`, `DemoBanner`, `EmptyState`, `AlertBanner`, `PageHeader` |
| `VaultsView.vue` | Tresore als Karten mit Eintragsanzahl; Klick führt zu `/?vault=<id>` | `useVault`, `DemoBanner`, `AlertBanner`, `PageHeader` |
| `GeneratorView.vue` | Passwortgenerator: Länge (Regler + Zahl), vier Zeichenarten, Kopieren, Stärkeanzeige; Hinweis, wenn die Zwischenablage nicht verfügbar ist. Das Passwort lebt nur in der Komponente | `passwordGenerator`, `clipboard`, `CopyButton`, `StrengthMeter`, `AlertBanner`, `PageHeader` |
| `SettingsView.vue` | Benutzerinformationen (aus `authState`), Server-Status (`getHealth`), Farbschema, **vorbereitete Sicherheitsbereiche (Master-Passwort, Auto-Sperre, 2FA) klar als „Noch nicht verfügbar“** | `authState`, `getHealth`, `preferences`, `AlertBanner`, `PageHeader` |
| `LoginView.vue` | Anmeldeformular. Logik unverändert: Pflichtfeldprüfung, `login()`, Fehlermeldung, **Redirect nur auf interne Pfade** (`startsWith('/')` und nicht `//`) | `AuthLayout`, `ApiError`, `login` |
| `RegisterView.vue` | Registrierungsformular mit clientseitiger Validierung (spiegelt die Backend-Regeln) und Feldfehlern aus `ApiError.fieldErrors`; Hinweis, dass das Masterpasswort separat festgelegt und nie gesendet wird | `AuthLayout`, `ApiError`, `register` |

#### Layout (`components/layout/`)

| Datei | Aufgabe | Imports |
|---|---|---|
| `AppLayout.vue` | Rahmen des geschützten Bereichs: Sidebar (auf großen Bildschirmen einklappbar, Zustand in `preferences`), auf Bildschirmen < 860 px ein Drawer (Scrim, Esc, Fokus-Rückgabe, `inert` für den Inhalt), „Zum Inhalt springen“-Link, `<RouterView/>`; lädt beim Mounten die Tresordaten | `SidebarNav`, `AppLogo`, `AppIcon`, `useVault`, `preferences`, `vue-router` |
| `SidebarNav.vue` | Navigation (Alle Einträge, Favoriten, Tresore, Generator, Einstellungen) mit Zählern, Benutzerkarte, **Abmelden** (`logout()` dann `/login`), Einklappen | `AppIcon`, `AppLogo`, `useVault`, `authState`, `logout`, `initialOf` |
| `AuthLayout.vue` | Zentrierte Karte mit Logo für Login/Registrierung | `AppLogo` |

#### Gemeinsame Komponenten (`components/common/`)

| Datei | Aufgabe | Imports |
|---|---|---|
| `icons.ts` | Pfaddaten aller Icons (`ICONS`, Typ `IconName`) | – |
| `AppIcon.vue` | Inline-SVG (kein Inline-Style, CSP-konform) | `icons.ts` |
| `AppLogo.vue` | Logo-SVG und Name | – |
| `AlertBanner.vue` | Hinweisbox (`info`/`warning`/`error`/`success`), `role="alert"` bei Fehlern | `AppIcon` |
| `BaseDialog.vue` | Modaler Dialog auf Basis des nativen `<dialog>` (Fokusfalle, Esc, inerter Hintergrund). Inhalt wird nur bei geöffnetem Dialog gerendert; Varianten `center` und `side` | `AppIcon` |
| `ConfirmDialog.vue` | Bestätigungsdialog (Löschen), Fehleranzeige, „Bitte warten“-Zustand | `BaseDialog` |
| `EmptyState.vue` | Leerer Zustand mit Icon, Text, optionaler Aktion | `AppIcon`, `icons` |
| `PageHeader.vue` | Überschrift, Untertitel, Aktions-Slot | – |
| `CopyButton.vue` | Kopieren mit Rückmeldung (Häkchen, `aria-live`), meldet Fehler per Event | `clipboard`, `AppIcon` |
| `PasswordField.vue` | Passwortfeld mit Anzeigen/Verbergen (`aria-pressed`), optional schreibgeschützt + kopierbar; `autocomplete="off"` | `AppIcon`, `CopyButton` |
| `StrengthMeter.vue` | Stärkeanzeige aus Entropie-Bits | `passwordGenerator` (`strengthOf`) |

#### Tresor-Komponenten (`components/vault/`)

| Datei | Aufgabe | Imports |
|---|---|---|
| `DemoBanner.vue` | Dauerhafter Hinweis „Demo-Modus – keine Verschlüsselung, keine Speicherung“ | `AlertBanner` |
| `EntryToolbar.vue` | Suchfeld, Tresor-Filter, Sortierung, „Nur Favoriten“ (`defineModel`); exportiert Typ `SortMode` | `AppIcon`, `types/vault` |
| `EntryList.vue` | Liste der Einträge | `EntryListItem` |
| `EntryListItem.vue` | Eine Zeile: Avatar (CSS-Klassen statt Inline-Style), Name, Benutzername, Host, Tresor-Badge, Favoriten-Stern (eigener Button) | `AppIcon`, `hostnameOf`, `initialOf` |
| `EntryListSkeleton.vue` | Ladeplatzhalter | – |
| `EntryDetail.vue` | Detailansicht: Benutzername (kopieren), Passwort (anzeigen/kopieren), Website (nur sicherer Link, `rel="noopener noreferrer"`), Notizen als reiner Text (`pre-wrap`), Bearbeiten/Löschen/Favorit | `PasswordField`, `CopyButton`, `AlertBanner`, `AppIcon`, `safeHref`, `hostnameOf`, `formatDateTime` |
| `EntryForm.vue` | Formular (Name, Benutzername, Passwort, URL, Tresor, Notizen) mit Validierung (Längenlimits, nur `http(s)`-URL), Demo-Warnung, `aria-invalid`/`aria-describedby` | `PasswordField`, `AlertBanner`, `parseHttpUrl`, `types/vault` |
| `EntryFormDialog.vue` | `BaseDialog` + `EntryForm`; Zustand entsteht bei jedem Öffnen neu | `BaseDialog`, `EntryForm` |

#### Styles (`assets/styles/`)

| Datei | Inhalt |
|---|---|
| `tokens.css` | Design-Tokens: Farben (dunkel als Standard, `:root[data-theme='light']` für hell), Abstände, Radien, Schatten, Sidebar-Breiten. System-Schriften (keine Web-Fonts wegen CSP) |
| `base.css` | Reset, Typografie, Fokus-Ring (`:focus-visible`), `.sr-only`, `prefers-reduced-motion` |
| `ui.css` | Wiederverwendbare Klassen: `.btn*`, `.field*`, `.input`, `.check`, `.card`, `.badge*`, Auth-Formulare |

Entfernt wurde `assets/auth-form.css` (ersetzt durch `ui.css` und `AuthLayout.vue`).

---

## 6. Import- und Abhängigkeitsgraphen

### 6.1 Backend (Pfeil = „importiert“)

```
main.py ──► api/auth.py ─────► api/deps.py ──► core/security.py ──► core/config.py
   │            │   │             │   │
   │            │   │             │   └────────► db/models.py ──► db/base.py
   │            │   └──────────► core/rate_limit.py
   │            ├──────────────► schemas/auth.py
   │            └──────────────► db/session.py ──► core/config.py
   ├──────────► api/health.py ─► db/session.py
   ├──────────► api/deps.py (verify_same_origin, global)
   ├──────────► core/middleware.py
   └──────────► core/config.py
```

Merkregel: `core/` (Konfiguration, Krypto, Middleware, Limiter) kennt keine Datenbank-Modelle; `deps.py` verbindet
Sicherheitslogik mit der Datenbank; `api/*` enthält die Endpunkte; `db/*` kennt nur `config`.

### 6.2 Frontend

```
index.html ─► main.ts ─┬─► App.vue ─► router/index.ts ─┬─► services/auth.ts ─► services/api.ts
                       ├─► services/preferences.ts      ├─► AppLayout ─► SidebarNav ─► useVault ─► services/vault/index ─► demoVaultRepository
                       ├─► services/api.ts              │                                │                  └─► vaultRepository (Interface)
                       └─► services/auth.ts             │                                └─► services/auth.ts (authState, logout)
                                                        └─► Views
Views:  HomeView ─► useVault, Entry*-Komponenten, BaseDialog/ConfirmDialog, utils/format
        VaultsView ─► useVault        GeneratorView ─► passwordGenerator, clipboard
        SettingsView ─► api (getHealth), auth, preferences
        LoginView / RegisterView ─► AuthLayout, api (ApiError), auth
```

Einseitige Abhängigkeiten, die die Austauschbarkeit sichern: Komponenten importieren **nie** `api.ts` oder das Repository
direkt, sondern nur `useVault`. `useVault` kennt nur das Interface (`VaultRepository`) und die Factory
(`services/vault/index.ts`).

---

## 7. Wo die Verschlüsselung später andockt

Die Architektur ist so angelegt, dass die Oberfläche unverändert bleiben kann. Notwendig sind:

**Frontend**
1. `services/crypto/` (neu): Schlüsselableitung (Argon2id-WASM → KEK), Erzeugen/Umhüllen des Vault Keys, AES-256-GCM
   (Web Crypto, 12-Byte-Nonce pro Verschlüsselung, 16-Byte-Tag getrennt vom Chiffretext ablegen). Der Vault Key bleibt nur im RAM.
2. `services/vault/encryptedVaultRepository.ts` (neu): implementiert `VaultRepository`; verschlüsselt den Eintrag
   (JSON mit Name, Benutzername, Passwort, URL, Notizen) und spricht mit der Tresor-API über `api.ts` (CSRF ist dort bereits geregelt).
3. `services/vault/index.ts`: statt `createDemoVaultRepository()` die verschlüsselte Variante liefern, `isDemo=false`,
   `isEncrypted=true` (der Demo-Banner verschwindet dann automatisch).
4. `SettingsView.vue`: den Bereich „Master-Passwort einrichten“ aktivieren; eine Entsperr-Ansicht ergänzen.
   Ein neuer Router-Guard kann „Tresor gesperrt“ abbilden.
5. HTTPS ist Voraussetzung, weil `crypto.subtle` nur in sicheren Kontexten existiert.

**Backend**
1. `schemas/vault.py` (neu): Binärfelder mit Längenprüfung (Nonce 12, Tag 16).
2. `api/vault.py` (neu): CRUD für `vaults`/`vault_entries` mit `Depends(get_auth)` (CSRF und Session sind damit automatisch
   abgesichert); jede Abfrage nach `ctx.user.id` einschränken (Besitzprüfung); Endpunkte zum Speichern/Lesen der
   `users.master_kdf_*`/`vault_key_*`-Felder (`UserOut` gibt sie bewusst **nicht** aus, `/api/auth/me` liefert sie nicht).
3. `main.py`: `app.include_router(vault.router, prefix="/api")`.
4. Die Modelle `Vault`/`VaultEntry` und das Schema existieren bereits; ob das ER-Modell final ist, steht laut `CLAUDE.md` noch aus.

---

## 8. Bekannte Lücken und Hinweise

| # | Punkt | Auswirkung / Empfehlung |
|---|---|---|
| 1 | **Keine Verschlüsselung und keine Tresor-API** | Selbst angelegte Einträge werden nicht gespeichert (Abschnitt 7 beschreibt den Weg). Echte Zugangsdaten gehören nicht in die Demo |
| 2 | `README.md` ist veraltet | Sie nennt Registrierung/Anmeldung und HTTPS „nicht umgesetzt“, obwohl beides existiert, und beschreibt das Frontend noch als „Startseite“. Ändern nur auf Auftrag |
| 3 | `users.locked_until` fehlt in `migrations/001…` | Bei einer Datenbank, die vor dieser Spalte angelegt wurde, würde die Anmeldung mit einem SQL-Fehler scheitern. Mit `SHOW COLUMNS` prüfen (Abschnitt 5.2); falls sie fehlt, eine idempotente Migration (`ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL`) ergänzen |
| 4 | HTTP ohne TLS | Ohne Zertifikat in `ssl/` läuft nur HTTP; Cookie und Login-Passwort sind im Netz lesbar. Bei HTTPS zwingend `COOKIE_SECURE=true` setzen (Standard `false`) |
| 5 | Rate-Limiter nur im RAM | Zähler gehen beim Neustart verloren und gelten pro Worker. Bei mehr als einem Uvicorn-Worker wäre ein gemeinsamer Speicher nötig (siehe Docstring in `rate_limit.py`) |
| 6 | Client-IP-Vertrauen | `_client_ip` nimmt den **letzten** `X-Forwarded-For`-Eintrag. Das stimmt nur, solange ausschließlich Apache das Backend erreicht (so ist es: Port 8000 wird nicht veröffentlicht) |
| 7 | Frontend ist im Image eingebacken | Codeänderungen sind erst nach `docker compose up -d --build frontend` sichtbar |
| 8 | Nur Tests mit echter DB | Die Backend-Tests brauchen eine MariaDB mit der Datenbank `pivault_test` und brechen sonst absichtlich ab. Es gibt noch keine Frontend-Tests |
| 9 | Prüfsumme schützt nur vor Beschädigung | `backup.sh`/`restore.sh` prüfen Integrität, nicht Authentizität: Wer Backup **und** `.sha256` austauschen kann, wird nicht erkannt |

---

*Ende der Dokumentation. Pflege-Hinweis: Wenn sich Dateien, Imports oder Sicherheitsmechanismen ändern, bitte die
Abschnitte 3 (Matrix), 5 (Dateien) und 6 (Graphen) mitpflegen.*
