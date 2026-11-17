"""Sicherheits-Middlewares für FastAPI:

1. ContentSizeLimitMiddleware:
   Schützt den Server vor Denial-of-Service-Angriffen durch übergroße Request-Bodies.
   Prüft sowohl den Content-Length-Header als auch gestreamte Chunks und weist
   Anfragen mit HTTP 413 (Payload Too Large) ab.

2. SecurityHeadersMiddleware:
   Setzt defensive HTTP-Sicherheitsheader auf jede ausgehende Antwort der API:
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - Referrer-Policy: same-origin
"""

import json
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send


class PayloadTooLargeError(Exception):
    """Signalisiert Überschreitung der maximalen Request-Größe."""


class ContentSizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        content_length_header = headers.get("content-length")
        if content_length_header:
            try:
                content_length = int(content_length_header)
                if content_length > self.max_bytes:
                    await self._send_413(send)
                    return
            except ValueError:
                pass

        total_bytes = 0
        response_started = False
        rejected = False

        async def limited_receive() -> dict:
            nonlocal total_bytes, rejected
            message = await receive()
            if message["type"] == "http.request":
                body = message.get("body", b"")
                total_bytes += len(body)
                if total_bytes > self.max_bytes:
                    # Sofort mit 413 antworten: FastAPI würde die Exception beim Lesen des Bodys
                    # sonst abfangen und als 400 ("error parsing the body") melden.
                    if not response_started and not rejected:
                        rejected = True
                        await self._send_413(send)
                    raise PayloadTooLargeError()
            return message

        async def guarded_send(message: dict) -> None:
            nonlocal response_started
            if rejected:
                return  # 413 wurde bereits gesendet, weitere Antworten der Anwendung verwerfen
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except PayloadTooLargeError:
            if not response_started and not rejected:
                await self._send_413(send)

    async def _send_413(self, send: Send) -> None:
        response_body = json.dumps(
            {"detail": "Anfragekörper überschreitet die maximal erlaubte Größe."}
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(response_body)).encode("ascii")),
                    (b"connection", b"close"),
                ],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": response_body,
            }
        )


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                header_keys = {k.lower() for k, _ in raw_headers}

                if b"x-content-type-options" not in header_keys:
                    raw_headers.append((b"x-content-type-options", b"nosniff"))
                if b"x-frame-options" not in header_keys:
                    raw_headers.append((b"x-frame-options", b"DENY"))
                if b"referrer-policy" not in header_keys:
                    raw_headers.append((b"referrer-policy", b"same-origin"))

                message["headers"] = raw_headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
