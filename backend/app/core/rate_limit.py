"""Thread-sicherer Rate-Limiter für PiVault.

Architekturhinweis:
------------------
Dieser Rate-Limiter verwendet ein gleitendes Zeitfenster (Sliding Window) mit
threading.Lock für Thread-Sicherheit innerhalb des laufenden Prozesses.
Im Standard-Deployment von PiVault (Uvicorn mit einem Worker im Docker-Container)
gewährleistet dies einen exakten und performanten Schutz ohne externe Abhängigkeiten.
Die Zähler liegen im Arbeitsspeicher und gehen bei einem Neustart verloren.

Brute-Force-Schutz ohne Aussperr-DoS:
-------------------------------------
Fehlversuche werden je Kombination aus Client-IP und Benutzername/E-Mail gezählt
(siehe api/auth.py), nicht je Konto. Ein Angreifer kann damit nur seine eigene
Kombination blockieren, aber niemanden aus dem eigenen Konto aussperren.

Grenzen bei Multi-Worker-Deployments:
------------------------------------
Wird Uvicorn mit mehreren Worker-Prozessen betrieben (`--workers N`), besitzt
jeder Worker seinen eigenen prozesslokalen Speicher. In diesem Szenario teilt
sich das Gesamtkontingent auf N Worker auf (ein Angreifer könnte theoretisch bis zu
N * Limit Anfragen absetzen). Für eine horizontale Skalierung über mehrere Prozesse
oder Server-Knoten hinweg ist eine geteilte Zustandshaltung (z. B. via Redis
oder eine atomare MariaDB-Rate-Limit-Tabelle) erforderlich.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    # Alle PRUNE_EVERY Aufrufe werden Schlüssel ohne aktuelle Einträge entfernt,
    # damit der Speicher bei vielen wechselnden Client-IPs nicht unbegrenzt wächst.
    PRUNE_EVERY = 256

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._events: dict[str, deque[float]] = {}
        self._expires: dict[str, float] = {}  # Zeitpunkt, ab dem alle Einträge eines Schlüssels verfallen sind
        self._calls = 0

    # -------------------------------------------------------------- intern
    def _trim(self, key: str, now: float, window_seconds: float) -> deque[float]:
        queue = self._events.get(key)
        if queue is None:
            return deque()
        threshold = now - window_seconds
        while queue and queue[0] <= threshold:
            queue.popleft()
        return queue

    def _append(self, key: str, now: float, window_seconds: float) -> None:
        self._events.setdefault(key, deque()).append(now)
        self._expires[key] = max(self._expires.get(key, 0.0), now + window_seconds)

    def _maybe_prune(self, now: float) -> None:
        self._calls += 1
        if self._calls % self.PRUNE_EVERY:
            return
        for key in [k for k, expires in self._expires.items() if expires <= now]:
            self._events.pop(key, None)
            self._expires.pop(key, None)

    # -------------------------------------------------------------- API
    def check_rate_limit(self, key: str, max_requests: int, window_seconds: float) -> tuple[bool, int]:
        """Zählt eine Anfrage und prüft, ob das Limit überschritten wurde.

        Gibt (True, 0) zurück, wenn der Request erlaubt ist.
        Gibt (False, retry_after_seconds) zurück, wenn das Limit erreicht ist.
        """
        with self._lock:
            now = self._clock()
            self._maybe_prune(now)
            queue = self._trim(key, now, window_seconds)
            if len(queue) >= max_requests:
                retry_after = max(1, math.ceil(window_seconds - (now - queue[0])))
                return False, retry_after
            self._append(key, now, window_seconds)
            return True, 0

    def is_blocked(self, key: str, max_events: int, window_seconds: float) -> tuple[bool, int]:
        """Prüft, ob für den Schlüssel bereits max_events Ereignisse im Fenster liegen (zählt nichts mit)."""
        with self._lock:
            now = self._clock()
            self._maybe_prune(now)
            queue = self._trim(key, now, window_seconds)
            if len(queue) >= max_events:
                return True, max(1, math.ceil(window_seconds - (now - queue[0])))
            return False, 0

    def record_event(self, key: str, window_seconds: float) -> None:
        """Merkt sich ein Ereignis (z. B. einen Fehlversuch) für die Dauer des Fensters."""
        with self._lock:
            self._append(key, self._clock(), window_seconds)

    def clear(self, key: str) -> None:
        """Löscht alle Ereignisse eines Schlüssels (z. B. nach erfolgreicher Anmeldung)."""
        with self._lock:
            self._events.pop(key, None)
            self._expires.pop(key, None)

    def size(self) -> int:
        """Anzahl der aktuell gespeicherten Schlüssel."""
        with self._lock:
            return len(self._events)

    def reset(self) -> None:
        """Setzt alle Limits und Zähler zurück (für Tests und Bereinigung)."""
        with self._lock:
            self._events.clear()
            self._expires.clear()


# Globales Singleton für das Backend
rate_limiter = RateLimiter()
