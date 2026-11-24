// Kryptografisch sichere Zufallswerte.
//
// Quelle ist ausschließlich crypto.getRandomValues() (CSPRNG des Betriebssystems). Math.random() wird
// nirgends verwendet. getRandomValues ist auch in unsicheren Kontexten (HTTP) verfügbar; die Ver- und
// Entschlüsselung selbst (crypto.subtle) braucht dagegen einen sicheren Kontext, siehe aesGcm.ts.
//
// ---------------------------------------------------------------------------------------------------
// NONCES (AES-GCM) – warum Eindeutigkeit zwingend ist
// ---------------------------------------------------------------------------------------------------
// Verschlüsselt man mit demselben Schlüssel und derselben Nonce zwei verschiedene Klartexte, verrät das
// den XOR der Klartexte und erlaubt Fälschungen (der GCM-Authentifizierungsschlüssel lässt sich
// berechnen). Eine Nonce darf deshalb pro Schlüssel NIE ein zweites Mal verwendet werden.
//
// PiVault verwendet 96-Bit-Nonces (12 Byte), jedes Mal frisch zufällig erzeugt (NIST SP 800-38D, 8.2.2).
// Zwei zufällige Nonces kollidieren nach dem Geburtstagsparadoxon: Bei q Verschlüsselungen unter einem
// Schlüssel ist die Kollisionswahrscheinlichkeit etwa q² / 2^97. NIST begrenzt deshalb die Anzahl der
// Verschlüsselungen mit zufälligen 96-Bit-Nonces pro Schlüssel auf 2^32 (Wahrscheinlichkeit dann
// höchstens 2^-33). Zur Einordnung: Bei 1.000 Speichervorgängen pro Tag wäre diese Grenze erst nach
// mehr als 11.000 Jahren erreicht. Für einen persönlichen Tresor reicht das; bei einer späteren
// Sammelverschlüsselung (z. B. Massenimport) oder mehr Daten pro Schlüssel muss neu bewertet werden.
//
// Folgerungen für den Code:
//   * Die Nonce wird ausschließlich hier erzeugt; encrypt() akzeptiert keine von außen übergebene Nonce.
//   * Jede Verschlüsselung erzeugt eine neue Nonce, auch beim erneuten Speichern desselben Eintrags.
//   * Die Nonce wird zusammen mit dem Chiffretext gespeichert (sie ist nicht geheim).

import { CryptoFormatError, CryptoUnavailableError } from './errors'

/** AES-GCM-Nonce: 96 Bit */
export const NONCE_BYTES = 12

/** Obergrenze von crypto.getRandomValues pro Aufruf (Spezifikation: 65.536 Byte) */
export const MAX_RANDOM_BYTES = 65536

function getRandomSource(): Crypto {
  const source = globalThis.crypto
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new CryptoUnavailableError(
      'Dieser Browser stellt keinen sicheren Zufallsgenerator bereit. Es wird nichts ver- oder entschlüsselt.',
    )
  }
  return source
}

/** Liefert `length` kryptografisch sichere Zufallsbytes (1 bis 65.536). */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM_BYTES) {
    throw new CryptoFormatError(`Die Länge der Zufallsdaten muss zwischen 1 und ${MAX_RANDOM_BYTES} liegen.`)
  }
  const out = new Uint8Array(length)
  // Als Methode des Crypto-Objekts aufrufen (this-Bindung)
  getRandomSource().getRandomValues(out)
  return out
}

/** Neue, zufällige 96-Bit-Nonce für genau eine AES-GCM-Verschlüsselung. */
export function generateNonce(): Uint8Array {
  return randomBytes(NONCE_BYTES)
}
