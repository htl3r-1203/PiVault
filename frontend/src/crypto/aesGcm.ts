// AES-256-GCM über die standardisierte Web Crypto API (crypto.subtle). Keine eigenen Algorithmen,
// keine zusätzliche Bibliothek.
//
// Eigenschaften:
//   * 256-Bit-Schlüssel (nur CryptoKey-Objekte; Rohschlüssel werden einmal importiert und sind danach
//     standardmäßig nicht mehr auslesbar).
//   * Pro Verschlüsselung eine frische zufällige 96-Bit-Nonce (siehe random.ts, dort auch die
//     Kollisionsgrenzen). Eine Nonce von außen anzunehmen ist nicht möglich.
//   * 128-Bit-Tag, AAD aus Formatversion und Kontext (siehe format.ts).
//   * Streng: Schlüsseltyp und -länge, Nonce, Tag, Version, Kontext und Größen werden geprüft, bevor
//     Web Crypto aufgerufen wird.
//   * Fehler: Entschlüsselungsfehler werden zu einem einzigen, allgemeinen DecryptionError. Es gibt nie ein
//     Teilergebnis. Nichts wird protokolliert; Fehlermeldungen enthalten keine Geheimnisse.
//
// SICHERER KONTEXT: crypto.subtle gibt es im Browser nur über HTTPS oder auf localhost/127.0.0.1.
// Über einfaches HTTP (z. B. http://<Pi-IP>:8080) ist es nicht vorhanden. Dann wirft getSubtle() einen
// CryptoUnavailableError mit einem erklärenden Hinweis. Die UI kann vorab isCryptoAvailable() prüfen.
// Es gibt bewusst keinen Ersatz in reinem JavaScript.

import { assertBytes } from './encoding'
import { CryptoFormatError, CryptoUnavailableError, DecryptionError } from './errors'
import {
  CURRENT_FORMAT_VERSION,
  MAX_PLAINTEXT_BYTES,
  TAG_BYTES,
  assertValidBlob,
  buildAad,
  type EncryptedBlob,
  type EncryptionContext,
} from './format'
import { generateNonce } from './random'

/** AES-256: 32 Byte */
export const AES_KEY_BYTES = 32

/** true, wenn Web Crypto (crypto.subtle) in diesem Kontext benutzbar ist */
export function isCryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.encrypt === 'function'
}

/** Liefert crypto.subtle oder wirft CryptoUnavailableError (siehe Hinweis zum sicheren Kontext oben). */
export function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    // isSecureContext ist im Browser false, wenn die Seite über unverschlüsseltes HTTP geladen wurde
    const insecure = typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext
    throw new CryptoUnavailableError(
      insecure
        ? 'Verschlüsselung ist nur über HTTPS oder auf localhost verfügbar. Diese Seite wurde über ein ungesichertes HTTP geladen.'
        : 'Dieser Browser stellt die Web-Crypto-Funktionen nicht bereit. Es wird nichts ver- oder entschlüsselt.',
    )
  }
  return subtle
}

/** Kopie als Uint8Array<ArrayBuffer>: kein Aliasing mit Aufrufer-Daten, passt zu den Web-Crypto-Typen */
function copyOf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

function assertKey(key: unknown, usage: 'encrypt' | 'decrypt'): asserts key is CryptoKey {
  if (typeof CryptoKey === 'undefined' || !(key instanceof CryptoKey)) {
    throw new CryptoFormatError('Ungültiger Schlüssel.')
  }
  const algorithm = key.algorithm as Partial<AesKeyAlgorithm>
  if (
    key.type !== 'secret' ||
    algorithm.name !== 'AES-GCM' ||
    algorithm.length !== AES_KEY_BYTES * 8 ||
    !key.usages.includes(usage)
  ) {
    throw new CryptoFormatError('Der Schlüssel ist kein AES-256-GCM-Schlüssel für diesen Zweck.')
  }
}

/**
 * Importiert einen Rohschlüssel (genau 32 Byte). Das Ergebnis ist standardmäßig NICHT extrahierbar.
 * Die Eingabe wird kopiert; der Aufrufer sollte sein Original anschließend mit zeroize() überschreiben.
 */
export async function importAesKey(raw: Uint8Array, options: { extractable?: boolean } = {}): Promise<CryptoKey> {
  assertBytes(raw, 'Schlüssel')
  if (raw.length !== AES_KEY_BYTES) {
    throw new CryptoFormatError(`Der Schlüssel muss genau ${AES_KEY_BYTES} Byte (256 Bit) lang sein.`)
  }
  return getSubtle().importKey('raw', copyOf(raw), { name: 'AES-GCM' }, options.extractable === true, [
    'encrypt',
    'decrypt',
  ])
}

/** Erzeugt einen neuen zufälligen AES-256-GCM-Schlüssel (standardmäßig nicht extrahierbar). */
export async function generateAesKey(options: { extractable?: boolean } = {}): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: 'AES-GCM', length: AES_KEY_BYTES * 8 }, options.extractable === true, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Verschlüsselt `plaintext` für den angegebenen Kontext. Die Nonce erzeugt diese Funktion selbst.
 * Leerer Klartext wird abgelehnt (die Datenbank verlangt nicht-leere Chiffretexte).
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  context: EncryptionContext,
): Promise<EncryptedBlob> {
  assertKey(key, 'encrypt')
  assertBytes(plaintext, 'Klartext')
  if (plaintext.length < 1 || plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new CryptoFormatError(`Der Klartext muss zwischen 1 und ${MAX_PLAINTEXT_BYTES} Byte lang sein.`)
  }
  const version = CURRENT_FORMAT_VERSION
  const aad = buildAad(version, context)
  const nonce = generateNonce()

  let output: Uint8Array
  try {
    const result = await getSubtle().encrypt(
      { name: 'AES-GCM', iv: copyOf(nonce), additionalData: copyOf(aad), tagLength: TAG_BYTES * 8 },
      key,
      copyOf(plaintext),
    )
    output = new Uint8Array(result)
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error
    throw new CryptoFormatError('Die Verschlüsselung ist fehlgeschlagen.')
  }
  // Web Crypto liefert Chiffretext || Tag; getrennt zurückgeben (passt zu den DB-Spalten)
  const split = output.length - TAG_BYTES
  return { version, nonce, ciphertext: output.slice(0, split), tag: output.slice(split) }
}

/**
 * Entschlüsselt einen Block. Wirft CryptoFormatError bei ungültigem Format/Schlüssel/Kontext und
 * DecryptionError, wenn die Authentifizierung scheitert (falscher Schlüssel, falsches AAD, Manipulation).
 */
export async function decrypt(key: CryptoKey, blob: EncryptedBlob, context: EncryptionContext): Promise<Uint8Array> {
  assertKey(key, 'decrypt')
  assertValidBlob(blob)
  const aad = buildAad(blob.version, context)
  const subtle = getSubtle()

  const data = new Uint8Array(blob.ciphertext.length + TAG_BYTES)
  data.set(blob.ciphertext, 0)
  data.set(blob.tag, blob.ciphertext.length)

  try {
    const result = await subtle.decrypt(
      { name: 'AES-GCM', iv: copyOf(blob.nonce), additionalData: copyOf(aad), tagLength: TAG_BYTES * 8 },
      key,
      data,
    )
    return new Uint8Array(result)
  } catch {
    // Bewusst keine Unterscheidung und keine Weitergabe der ursprünglichen Ausnahme
    throw new DecryptionError()
  }
}
