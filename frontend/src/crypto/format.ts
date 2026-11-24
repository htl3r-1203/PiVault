// Versioniertes Verschlüsselungsformat und kanonisches AAD (Additional Authenticated Data).
//
// ---------------------------------------------------------------------------------------------------
// Datenmodell: EncryptedBlob
// ---------------------------------------------------------------------------------------------------
//   version     Formatversion (heute 1)
//   nonce       12 Byte, zufällig pro Verschlüsselung            -> DB: nonce / name_nonce / vault_key_nonce
//   ciphertext  verschlüsselte Daten, gleich lang wie der Klartext -> DB: encrypted_data / encrypted_name / …
//   tag         16 Byte GCM-Authentifizierungstag                -> DB: auth_tag / name_tag / vault_key_tag
//
// Das entspricht den getrennten Spalten in database/schema.sql (Nonce 12 B, Tag 16 B per CHECK).
// Web Crypto liefert Chiffretext und Tag zusammen (Chiffretext || Tag); aesGcm.ts trennt sie.
//
// OFFEN (Abstimmung KAN-39/KAN-41, Schritt 5): Das Schema hat keine Spalte für die Formatversion. Sie ist
// aber Teil des AAD, die Entschlüsselung muss sie also kennen. Entweder kommt eine Spalte hinzu oder die
// Persistenzschicht speichert die Version über serializeBlob() (siehe unten) mit.
//
// ---------------------------------------------------------------------------------------------------
// Serialisierung (Einzelblock, z. B. für JSON/Transport)
// ---------------------------------------------------------------------------------------------------
//   Byte 0        Formatversion
//   Byte 1..12    Nonce
//   Byte 13..n-16 Chiffretext
//   Letzte 16     Tag
//
// ---------------------------------------------------------------------------------------------------
// AAD v1 (kanonisch, feste Länge 18 Byte, keine Texte, daher keine Mehrdeutigkeit)
// ---------------------------------------------------------------------------------------------------
//   Byte  0..3   Magic "PVLT" (0x50 0x56 0x4C 0x54)
//   Byte  4      Formatversion (u8)
//   Byte  5      Zweck (u8): 1 vault-key, 2 vault-name, 3 vault-description, 4 entry
//   Byte  6..9   userId  (u32, Big Endian)
//   Byte 10..13  vaultId (u32, Big Endian; 0, wenn der Zweck keine Tresor-ID hat)
//   Byte 14..17  entryId (u32, Big Endian; 0, wenn der Zweck keine Eintrags-ID hat)
//
// Das AAD wird nicht gespeichert, sondern bei Ver- und Entschlüsselung aus dem Kontext neu berechnet.
// Der GCM-Tag deckt es mit ab: Ändert jemand Version, Zweck oder IDs, oder verschiebt der Server einen
// Chiffretext an eine andere Stelle (anderer Benutzer, anderer Tresor, anderer Eintrag), schlägt die
// Entschlüsselung fehl. Nicht abgesichert wird dadurch: Löschen oder das Zurückspielen eines älteren
// Stands desselben Eintrags (Rollback).
//
// Pro Zweck sind genau die IDs Pflicht, die in PURPOSES (unten) festgelegt sind; alle anderen müssen fehlen.
// IDs sind positive Ganzzahlen bis 2^32-1 (INT UNSIGNED der Datenbank).
//
// OFFEN: Beim erstmaligen Anlegen eines Eintrags ist die entryId (AUTO_INCREMENT) noch nicht bekannt.
// Wie das gelöst wird (Server vergibt die ID vorab, oder Eintrags-ID wird clientseitig erzeugt), klärt
// sich mit KAN-39/KAN-41.

import { assertBytes, base64urlDecode, base64urlEncode } from './encoding'
import { CryptoFormatError } from './errors'
import { NONCE_BYTES } from './random'

export { NONCE_BYTES }

/** Aktuelle Formatversion; alle neuen Verschlüsselungen verwenden sie. */
export const CURRENT_FORMAT_VERSION = 1

/** Versionen, die gelesen werden dürfen. Alles andere wird abgelehnt (kein stilles Raten). */
export const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [1]

/** GCM-Tag: 128 Bit */
export const TAG_BYTES = 16

/**
 * Größtes Klartext-/Chiffretextstück (256 KiB). Hält den Speicherbedarf klein und liegt deutlich unter
 * dem Request-Limit des Backends (1 MiB, backend/app/core/config.py). Die Obergrenze dient auch als
 * Schutz vor überlangen, präparierten Eingaben.
 */
export const MAX_PLAINTEXT_BYTES = 256 * 1024

const AAD_MAGIC = [0x50, 0x56, 0x4c, 0x54] // "PVLT"
export const AAD_BYTES = 18
const MAX_ID = 0xffffffff

export type EncryptionPurpose = 'vault-key' | 'vault-name' | 'vault-description' | 'entry'

/** Wo ein Chiffretext hingehört. Wird als AAD authentifiziert. */
export type EncryptionContext =
  | { purpose: 'vault-key'; userId: number }
  | { purpose: 'vault-name'; userId: number; vaultId: number }
  | { purpose: 'vault-description'; userId: number; vaultId: number }
  | { purpose: 'entry'; userId: number; vaultId: number; entryId: number }

export interface EncryptedBlob {
  version: number
  nonce: Uint8Array
  ciphertext: Uint8Array
  tag: Uint8Array
}

interface PurposeSpec {
  code: number
  vaultId: boolean
  entryId: boolean
}

// Map statt Objekt-Literal: Ein Zweck wie "constructor" darf nicht über die Prototypkette gefunden werden
const PURPOSES = new Map<string, PurposeSpec>([
  ['vault-key', { code: 1, vaultId: false, entryId: false }],
  ['vault-name', { code: 2, vaultId: true, entryId: false }],
  ['vault-description', { code: 3, vaultId: true, entryId: false }],
  ['entry', { code: 4, vaultId: true, entryId: true }],
])

export function isSupportedVersion(version: unknown): version is number {
  return typeof version === 'number' && Number.isInteger(version) && SUPPORTED_FORMAT_VERSIONS.includes(version)
}

function assertSupportedVersion(version: unknown): asserts version is number {
  if (!isSupportedVersion(version)) {
    throw new CryptoFormatError('Nicht unterstützte Version des Verschlüsselungsformats.')
  }
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 255
  target[offset + 1] = (value >>> 16) & 255
  target[offset + 2] = (value >>> 8) & 255
  target[offset + 3] = value & 255
}

function idValue(context: Record<string, unknown>, field: string, required: boolean): number {
  const value = context[field]
  if (!required) {
    if (value !== undefined) throw new CryptoFormatError('Der Kontext enthält eine ID, die für diesen Zweck nicht erlaubt ist.')
    return 0
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_ID) {
    throw new CryptoFormatError('Der Kontext enthält eine ungültige oder fehlende ID.')
  }
  return value
}

/**
 * Baut das kanonische AAD (18 Byte) aus Formatversion und Kontext. Wirft CryptoFormatError bei
 * unbekanntem Zweck, fehlenden, überzähligen oder ungültigen IDs und bei nicht unterstützter Version.
 */
export function buildAad(version: number, context: EncryptionContext): Uint8Array {
  assertSupportedVersion(version)
  if (typeof context !== 'object' || context === null) {
    throw new CryptoFormatError('Der Verschlüsselungskontext fehlt.')
  }
  const fields = context as unknown as Record<string, unknown>
  const spec = typeof fields.purpose === 'string' ? PURPOSES.get(fields.purpose) : undefined
  if (!spec) throw new CryptoFormatError('Unbekannter Verschlüsselungszweck.')

  const userId = idValue(fields, 'userId', true)
  const vaultId = idValue(fields, 'vaultId', spec.vaultId)
  const entryId = idValue(fields, 'entryId', spec.entryId)

  const aad = new Uint8Array(AAD_BYTES)
  aad.set(AAD_MAGIC, 0)
  aad[4] = version
  aad[5] = spec.code
  writeUint32(aad, 6, userId)
  writeUint32(aad, 10, vaultId)
  writeUint32(aad, 14, entryId)
  return aad
}

/** Prüft Version, Längen und Typen eines Blocks. Wirft CryptoFormatError, verändert aber nichts. */
export function assertValidBlob(blob: unknown): asserts blob is EncryptedBlob {
  if (typeof blob !== 'object' || blob === null) {
    throw new CryptoFormatError('Der verschlüsselte Datenblock fehlt.')
  }
  const candidate = blob as Record<string, unknown>
  assertSupportedVersion(candidate.version)
  assertBytes(candidate.nonce, 'Nonce')
  assertBytes(candidate.ciphertext, 'Chiffretext')
  assertBytes(candidate.tag, 'Tag')
  if (candidate.nonce.length !== NONCE_BYTES) {
    throw new CryptoFormatError(`Die Nonce muss genau ${NONCE_BYTES} Byte lang sein.`)
  }
  if (candidate.tag.length !== TAG_BYTES) {
    throw new CryptoFormatError(`Der Tag muss genau ${TAG_BYTES} Byte lang sein.`)
  }
  if (candidate.ciphertext.length < 1 || candidate.ciphertext.length > MAX_PLAINTEXT_BYTES) {
    throw new CryptoFormatError('Der Chiffretext hat eine ungültige Länge.')
  }
}

/** Block -> Bytefolge: Version || Nonce || Chiffretext || Tag */
export function serializeBlob(blob: EncryptedBlob): Uint8Array {
  assertValidBlob(blob)
  const out = new Uint8Array(1 + NONCE_BYTES + blob.ciphertext.length + TAG_BYTES)
  out[0] = blob.version
  out.set(blob.nonce, 1)
  out.set(blob.ciphertext, 1 + NONCE_BYTES)
  out.set(blob.tag, 1 + NONCE_BYTES + blob.ciphertext.length)
  return out
}

/** Bytefolge -> Block. Prüft zuerst die Version, dann die Länge; liefert Kopien (kein Aliasing). */
export function parseBlob(bytes: Uint8Array): EncryptedBlob {
  assertBytes(bytes, 'Eingabe')
  const minLength = 1 + NONCE_BYTES + 1 + TAG_BYTES
  const maxLength = 1 + NONCE_BYTES + MAX_PLAINTEXT_BYTES + TAG_BYTES
  if (bytes.length < minLength || bytes.length > maxLength) {
    throw new CryptoFormatError('Der verschlüsselte Datenblock hat eine ungültige Länge.')
  }
  const version = bytes[0]!
  assertSupportedVersion(version)
  const tagStart = bytes.length - TAG_BYTES
  return {
    version,
    nonce: bytes.slice(1, 1 + NONCE_BYTES),
    ciphertext: bytes.slice(1 + NONCE_BYTES, tagStart),
    tag: bytes.slice(tagStart),
  }
}

/** Block -> Base64url-Text (für JSON-Übertragung) */
export function encodeBlob(blob: EncryptedBlob): string {
  return base64urlEncode(serializeBlob(blob))
}

/** Base64url-Text -> Block (streng, siehe encoding.ts) */
export function decodeBlob(text: string): EncryptedBlob {
  const maxBytes = 1 + NONCE_BYTES + MAX_PLAINTEXT_BYTES + TAG_BYTES
  return parseBlob(base64urlDecode(text, maxBytes))
}
