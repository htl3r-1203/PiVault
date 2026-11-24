// Web-Worker-Einstieg für die Argon2id-Schlüsselableitung: Die rechenintensive Ableitung blockiert so nicht
// den Haupt-Thread (die Oberfläche bleibt bedienbar). Der Worker hält keinen Zustand; kdf.ts erzeugt pro
// Ableitung einen neuen Worker und beendet ihn danach, damit der Arbeitsspeicher sofort frei wird.
//
// Das Ergebnis ist ein nicht extrahierbarer CryptoKey (Structured Clone), keine Rohbytes.

import { handleKdfRequest } from './kdfCore'

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  postMessage(message: unknown): void
}

const scope = self as unknown as WorkerScope

scope.addEventListener('message', (event) => {
  void handleKdfRequest(event.data).then((response) => scope.postMessage(response))
})
