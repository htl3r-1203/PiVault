// Versionierte KDF-Parameter, Grenzen und Passwort-Normalisierung.
//
// Die Parameter liegen in users.master_kdf_params (JSON) und werden vom Server geliefert. Der Server ist
// aus Sicht des Clients nicht vertrauenswürdig: Ein manipulierter Server könnte zu schwache Parameter
// (Downgrade) oder extrem große Parameter (Denial of Service im Browser) senden. Deshalb prüft der
// Client sie IMMER streng gegen feste Grenzen, bevor er sie verwendet.
//
// Format (Version 1), wie in database/schema.sql dokumentiert:
//   { "v": 1, "alg": "argon2id", "m": 32768, "t": 3, "p": 1, "len": 32 }
//   v = Parameterformat (zugleich Version der Schlüsselverpackung, siehe keyWrap.ts)
//   m = Speicher in KiB, t = Durchläufe, p = Parallelität, len = Schlüssellänge in Byte
//
// Grenzen (Begründung):
//   m: 19.456 KiB (19 MiB) ist das Minimum der aktuellen OWASP-Empfehlung für Argon2id (mit t = 2, p = 1).
//      Alles darunter wird abgelehnt. Das Maximum von 256 MiB schützt Mobilgeräte vor Speichererschöpfung.
//   t: 2 bis 6.
//   p: 1 bis 4. Die verwendete Implementierung rechnet Lanes nacheinander; p > 1 bringt hier keinen
//      Geschwindigkeitsvorteil, ändert aber das Ergebnis. Der Standard ist p = 1.
//   len: genau 32 Byte (AES-256).
// Standard: m = 32 MiB, t = 3, p = 1 (liegt über dem OWASP-Minimum von 19 MiB / t = 2). Begründung: Die
// verwendete Bibliothek ist reines JavaScript. Gemessen auf einem aktuellen Laptop (Node, ein Kern) dauert
// m = 19 MiB/t = 2 etwa 0,4 s, 32 MiB/t = 3 etwa 0,9 s und 64 MiB/t = 3 etwa 1,9 s. Auf Smartphones ist mit
// dem Mehrfachen zu rechnen. Der Standard ist ein Ausgangswert, der auf den echten Zielgeräten bestätigt
// werden muss (benchmarkKdf). Die Parameter stehen pro Benutzer in der Datenbank; eine spätere Erhöhung
// betrifft nur neu eingerichtete bzw. neu verpackte Schlüssel.
//
// Passwort-Normalisierung: Unicode NFKC, danach UTF-8. Entscheidung: Dasselbe Passwort wird auf
// verschiedenen Geräten unterschiedlich getippt/gespeichert (z. B. "ä" als ein Zeichen oder als "a" +
// kombinierender Punkt; macOS und Windows weichen hier ab). Ohne Normalisierung ließe sich ein Tresor auf
// einem anderen Gerät womöglich nicht mehr öffnen. NFKC entspricht dem Verfahren des Backends für das
// Login-Passwort (backend/app/core/security.py). Nachteil: Kompatibilitätszeichen werden gleichgesetzt
// (z. B. "ﬁ" = "fi", "²" = "2", Vollbreite-Zeichen = normale Zeichen); das ist hier unkritisch, mindert die
// Stärke aber geringfügig. Die Normalform ist Teil des Formats: Änderungen erfordern eine neue Version.

import { assertBytes, utf8Encode } from './encoding'
import { CryptoFormatError } from './errors'

export const KDF_VERSION = 1
export const SUPPORTED_KDF_VERSIONS: readonly number[] = [1]

export const KDF_LIMITS = {
  m: { min: 19_456, max: 262_144 },
  t: { min: 2, max: 6 },
  p: { min: 1, max: 4 },
  len: 32,
} as const

export const SALT_BYTES = 16
export const SALT_MIN_BYTES = 16
export const SALT_MAX_BYTES = 32

/** Obergrenze für das Passwort nach der Normalisierung (UTF-8-Bytes) */
export const MAX_PASSWORD_BYTES = 4096

export interface KdfParams {
  v: number
  alg: 'argon2id'
  m: number
  t: number
  p: number
  len: number
}

export const DEFAULT_KDF_PARAMS: Readonly<KdfParams> = Object.freeze({
  v: KDF_VERSION,
  alg: 'argon2id',
  m: 32_768,
  t: 3,
  p: 1,
  len: 32,
})

const EXPECTED_KEYS = ['alg', 'len', 'm', 'p', 't', 'v']

function intInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

/**
 * Prüft KDF-Parameter streng und liefert eine saubere Kopie. Wirft CryptoFormatError bei: kein Objekt,
 * fehlenden oder zusätzlichen Feldern, unbekannter Version oder Algorithmus, Werten außerhalb der
 * Grenzen oder falschen Typen (auch Zahlen als Text).
 */
export function validateKdfParams(input: unknown): KdfParams {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CryptoFormatError('Die KDF-Parameter fehlen oder sind ungültig.')
  }
  const keys = Object.keys(input).sort()
  if (keys.length !== EXPECTED_KEYS.length || keys.some((key, i) => key !== EXPECTED_KEYS[i])) {
    throw new CryptoFormatError('Die KDF-Parameter haben unerwartete oder fehlende Felder.')
  }
  const p = input as Record<string, unknown>
  if (typeof p.v !== 'number' || !SUPPORTED_KDF_VERSIONS.includes(p.v)) {
    throw new CryptoFormatError('Nicht unterstützte Version der KDF-Parameter.')
  }
  if (p.alg !== 'argon2id') throw new CryptoFormatError('Nicht unterstützter KDF-Algorithmus.')
  if (!intInRange(p.m, KDF_LIMITS.m.min, KDF_LIMITS.m.max)) {
    throw new CryptoFormatError('Der KDF-Speicherparameter liegt außerhalb des erlaubten Bereichs.')
  }
  if (!intInRange(p.t, KDF_LIMITS.t.min, KDF_LIMITS.t.max)) {
    throw new CryptoFormatError('Der KDF-Durchlaufparameter liegt außerhalb des erlaubten Bereichs.')
  }
  if (!intInRange(p.p, KDF_LIMITS.p.min, KDF_LIMITS.p.max)) {
    throw new CryptoFormatError('Der KDF-Parallelitätsparameter liegt außerhalb des erlaubten Bereichs.')
  }
  if (p.len !== KDF_LIMITS.len) throw new CryptoFormatError('Die KDF-Schlüssellänge muss 32 Byte betragen.')
  return { v: p.v, alg: 'argon2id', m: p.m, t: p.t, p: p.p, len: p.len }
}

/** Prüft das Salt (16 bis 32 Byte, wie der CHECK-Constraint der Datenbank). */
export function validateSalt(salt: unknown): asserts salt is Uint8Array {
  assertBytes(salt, 'Salt')
  if (salt.length < SALT_MIN_BYTES || salt.length > SALT_MAX_BYTES) {
    throw new CryptoFormatError(`Das Salt muss ${SALT_MIN_BYTES} bis ${SALT_MAX_BYTES} Byte lang sein.`)
  }
}

/**
 * Passwort -> normalisierte UTF-8-Bytes (NFKC). Lehnt leere Passwörter, ungültiges Unicode (einzelne
 * Surrogate) und zu lange Eingaben ab. Prüft bewusst KEINE Passwortstärke; das ist Aufgabe der UI.
 * Die zurückgegebenen Bytes gehören dem Aufrufer, der sie nach Gebrauch überschreiben soll.
 */
export function normalizePassword(password: string): Uint8Array {
  if (typeof password !== 'string') throw new CryptoFormatError('Das Passwort muss ein Text sein.')
  if (password.length === 0) throw new CryptoFormatError('Das Passwort darf nicht leer sein.')
  // Lange Eingaben vor der Normalisierung abweisen (NFKC kann Text auf das Mehrfache aufblähen)
  if (password.length > MAX_PASSWORD_BYTES) throw new CryptoFormatError('Das Passwort ist zu lang.')
  const bytes = utf8Encode(password.normalize('NFKC'))
  if (bytes.length > MAX_PASSWORD_BYTES) {
    bytes.fill(0)
    throw new CryptoFormatError('Das Passwort ist zu lang.')
  }
  return bytes
}
