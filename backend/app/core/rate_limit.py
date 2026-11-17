"""Thread-sicherer Rate-Limiter und Brute-Force-Schutz für PiVault.

Architekturhinweis:
------------------
Dieser Rate-Limiter verwendet ein gleitendes Zeitfenster (Sliding Window) mit
threading.Lock für Thread-Sicherheit innerhalb des laufenden Prozesses.
Im Standard-Deployment von PiVault (Uvicorn mit einem Worker im Docker-Container)
gewährleistet dies einen exakten und performanten Schutz ohne externe Abhängigkeiten.

Grenzen bei Multi-Worker-Deployments:
------------------------------------
Wird Uvicorn mit mehreren Worker-Prozessen betrieben (`--workers N`), besitzt
jeder Worker seinen eigenen prozesslokalen Speicher. In diesem Szenario teilt
sich das Gesamtkontingent auf N Worker auf (ein Angreifer könnte theoretisch bis zu
N * Limit Anfragen absetzen). Für eine horizontale Skalierung über mehrere Prozesse
oder Server-Knoten hinweg ist eine geteilte Zustandshaltung (z. B. via Redis
oder eine atomare MariaDB-Rate-Limit-Tabelle) erforderlich.
"""

from collections import defaultdict, deque
import math
import threading
import time


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._failed_attempts: dict[str, int] = defaultdict(int)

    def check_rate_limit(self, key: str, max_requests: int, window_seconds: float) -> tuple[bool, int]:
        """Prüft, ob für den angegebenen Schlüssel das Limit überschritten wurde.

        Gibt (True, 0) zurück, wenn der Request erlaubt ist.
        Gibt (False, retry_after_seconds) zurück, wenn das Limit erreicht ist.
        """
        now = time.monotonic()
        with self._lock:
            queue = self._requests[key]
            # Veraltete Zeitstempel außerhalb des Fensters entfernen
            threshold = now - window_seconds
            while queue and queue[0] < threshold:
                queue.popleft()

            if len(queue) >= max_requests:
                # Zeit bis zum Freiwerden des ältesten Eintrags
                oldest = queue[0]
                retry_after = max(1, math.ceil(window_seconds - (now - oldest)))
                return False, retry_after

            queue.append(now)
            return True, 0

    def record_failed_attempt(self, key: str) -> int:
        """Erhöht die Anzahl aufeinanderfolgender Fehlversuche für einen Account."""
        with self._lock:
            self._failed_attempts[key] += 1
            return self._failed_attempts[key]

    def reset_failed_attempts(self, key: str) -> None:
        """Setzt die Fehlversuche nach erfolgreicher Authentifizierung zurück."""
        with self._lock:
            self._failed_attempts.pop(key, None)

    def get_failed_attempts(self, key: str) -> int:
        """Gibt die aktuelle Anzahl Fehlversuche zurück."""
        with self._lock:
            return self._failed_attempts.get(key, 0)

    def reset(self) -> None:
        """Setzt alle Limits und Zähler zurück (für Tests und Bereinigung)."""
        with self._lock:
            self._requests.clear()
            self._failed_attempts.clear()


# Globales Singleton für das Backend
rate_limiter = RateLimiter()
