// Byte- und Textkodierung für den Kryptografie-Kern.
//
// - Base64url nach RFC 4648 §5, OHNE Padding, in strenger (kanonischer) Form: Jede Bytefolge hat genau
//   eine gültige Textdarstellung. Alles andere (Padding, Leerzeichen, Standard-Base64-Zeichen "+" und "/",
//   gesetzte Restbits) wird abgelehnt. Das verhindert, dass derselbe Chiffretext in mehreren Schreibweisen
//   auftaucht und erleichtert Vergleiche und Tests.
// - UTF-8 strikt: Ungültige Folgen und einzelne Surrogate führen zu einem Fehler, statt still durch das
//   Ersatzzeichen U+FFFD ersetzt zu werden (das würde z. B. ein Passwort unbemerkt verändern).
//
// Keine Abhängigkeit von btoa/atob oder Node-Buffer: läuft im Browser und in Node gleich.

import { CryptoFormatError } from './errors'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Zeichencode -> 6-Bit-Wert, -1 = ungültig
const LOOKUP = new Int8Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i

/** Obergrenze für dekodierte Daten, falls der Aufrufer keine eigene angibt */
export const DEFAULT_MAX_DECODED_BYTES = 1024 * 1024

export function assertBytes(value: unknown, name: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new CryptoFormatError(`${name} muss ein Uint8Array sein.`)
  }
}

/** Kodiert Bytes als Base64url ohne Padding. */
export function base64urlEncode(bytes: Uint8Array): string {
  assertBytes(bytes, 'Eingabe')
  const sextet = (n: number, shift: number) => ALPHABET.charAt((n >> shift) & 63)
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += sextet(n, 18) + sextet(n, 12) + sextet(n, 6) + sextet(n, 0)
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += sextet(n, 18) + sextet(n, 12)
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += sextet(n, 18) + sextet(n, 12) + sextet(n, 6)
  }
  return out
}

/**
 * Dekodiert strenges Base64url (ohne Padding). Wirft CryptoFormatError bei jeder Abweichung.
 * `maxBytes` begrenzt die Größe des Ergebnisses (Schutz vor überlangen Eingaben).
 */
export function base64urlDecode(text: string, maxBytes: number = DEFAULT_MAX_DECODED_BYTES): Uint8Array {
  if (typeof text !== 'string') throw new CryptoFormatError('Base64url-Eingabe muss ein Text sein.')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new CryptoFormatError('Ungültige Größenbegrenzung.')
  const length = text.length
  // Eine Länge von 4n+1 Zeichen kann keine ganze Zahl von Bytes darstellen
  if (length % 4 === 1) throw new CryptoFormatError('Ungültige Base64url-Länge.')
  const byteLength = Math.floor((length * 3) / 4)
  if (byteLength > maxBytes) throw new CryptoFormatError('Base64url-Eingabe ist zu groß.')

  const values = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const code = text.charCodeAt(i)
    const value = code < 128 ? LOOKUP[code]! : -1
    if (value < 0) throw new CryptoFormatError('Ungültiges Zeichen in Base64url-Eingabe.')
    values[i] = value
  }

  const out = new Uint8Array(byteLength)
  let o = 0
  let i = 0
  for (; i + 3 < length; i += 4) {
    const n = (values[i]! << 18) | (values[i + 1]! << 12) | (values[i + 2]! << 6) | values[i + 3]!
    out[o++] = (n >> 16) & 255
    out[o++] = (n >> 8) & 255
    out[o++] = n & 255
  }
  const rest = length - i
  if (rest === 2) {
    // Die unteren 4 Bit des letzten Zeichens müssen 0 sein (kanonische Form)
    if ((values[i + 1]! & 0x0f) !== 0) throw new CryptoFormatError('Nicht kanonische Base64url-Eingabe.')
    out[o++] = (values[i]! << 2) | (values[i + 1]! >> 4)
  } else if (rest === 3) {
    // Die unteren 2 Bit des letzten Zeichens müssen 0 sein
    if ((values[i + 2]! & 0x03) !== 0) throw new CryptoFormatError('Nicht kanonische Base64url-Eingabe.')
    const n = (values[i]! << 10) | (values[i + 1]! << 4) | (values[i + 2]! >> 2)
    out[o++] = (n >> 8) & 255
    out[o++] = n & 255
  }
  return out
}

function isWellFormedUtf16(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false
    }
  }
  return true
}

/** Text -> UTF-8. Einzelne Surrogate werden abgelehnt (kein stilles Ersetzen). */
export function utf8Encode(text: string): Uint8Array {
  if (typeof text !== 'string') throw new CryptoFormatError('Eingabe muss ein Text sein.')
  if (!isWellFormedUtf16(text)) throw new CryptoFormatError('Der Text enthält ungültige Unicode-Zeichen.')
  return new TextEncoder().encode(text)
}

/** UTF-8 -> Text. Ungültige Folgen werden abgelehnt; ein BOM bleibt erhalten (Roundtrip-treu). */
export function utf8Decode(bytes: Uint8Array): string {
  assertBytes(bytes, 'Eingabe')
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new CryptoFormatError('Die Daten sind kein gültiger UTF-8-Text.')
  }
}

/** Überschreibt die Bytes mit Nullen (best effort: Kopien, die das System angelegt hat, bleiben unberührt). */
export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0)
}
