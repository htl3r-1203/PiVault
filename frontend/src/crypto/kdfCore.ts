// Kern der Schlüsselableitung: Argon2id -> Key Encryption Key (KEK).
//
// Diese Datei enthält nur die Berechnung. Sie wird im Web Worker (kdf.worker.ts) ausgeführt, in Tests
// auch direkt. Das Ergebnis ist ein NICHT extrahierbarer CryptoKey: Die Rohbytes verlassen diese Funktion
// nie, sie werden nach dem Import mit Nullen überschrieben. Ein CryptoKey lässt sich per postMessage vom
// Worker an die Hauptseite übergeben (Structured Clone), ohne dass dort Rohbytes entstehen.
//
// Argon2id: @noble/hashes 2.4.0 (reines JavaScript, keine Abhängigkeiten, kein WASM).
// Der KEK darf ausschließlich Schlüssel ein- und auspacken (wrapKey/unwrapKey), nicht Daten ver- oder
// entschlüsseln (Prinzip der geringsten Berechtigung).

import { argon2id } from '@noble/hashes/argon2.js'
import { getSubtle } from './aesGcm'
import { assertBytes, zeroize } from './encoding'
import { CryptoFormatError, CryptoUnavailableError, KdfError } from './errors'
import { validateKdfParams, validateSalt } from './kdfParams'

/**
 * Leitet aus den bereits normalisierten Passwort-Bytes den KEK ab. Überschreibt `passwordBytes` danach
 * mit Nullen (auch im Fehlerfall). Parameter und Salt werden erneut streng geprüft.
 */
export async function deriveKekFromBytes(passwordBytes: Uint8Array, salt: Uint8Array, params: unknown): Promise<CryptoKey> {
  let derived: Uint8Array | undefined
  try {
    assertBytes(passwordBytes, 'Passwort')
    if (passwordBytes.length < 1) throw new CryptoFormatError('Das Passwort darf nicht leer sein.')
    validateSalt(salt)
    const checked = validateKdfParams(params)
    try {
      derived = argon2id(passwordBytes, salt, {
        t: checked.t,
        m: checked.m,
        p: checked.p,
        dkLen: checked.len,
        // Speicherbudget exakt auf den erlaubten Bedarf begrenzen
        maxmem: checked.m * 1024 + 1024 * 1024,
      })
    } catch {
      // Z. B. RangeError "Array buffer allocation failed": keine Details nach außen
      throw new KdfError()
    }
    return await getSubtle().importKey('raw', new Uint8Array(derived), { name: 'AES-GCM' }, false, [
      'wrapKey',
      'unwrapKey',
    ])
  } catch (error) {
    if (error instanceof CryptoFormatError || error instanceof CryptoUnavailableError || error instanceof KdfError) {
      throw error
    }
    throw new KdfError()
  } finally {
    zeroize(passwordBytes)
    if (derived) zeroize(derived)
  }
}

// ---------------------------------------------------------------------------------------------------
// Nachrichten zwischen Hauptseite und Worker
// ---------------------------------------------------------------------------------------------------

export interface KdfRequest {
  password: ArrayBuffer
  salt: ArrayBuffer
  params: unknown
}

export type KdfResponse = { ok: true; key: CryptoKey } | { ok: false; code: 'invalid-input' | 'unavailable' | 'kdf-failed' }

/**
 * Verarbeitet eine Anfrage und liefert nie eine Ausnahme: Fehler werden zu einem Code ohne Text, damit
 * weder Eingaben noch Details über die Nachrichtengrenze gelangen. Der Passwortpuffer wird überschrieben.
 */
export async function handleKdfRequest(request: unknown): Promise<KdfResponse> {
  try {
    if (typeof request !== 'object' || request === null) throw new CryptoFormatError('Ungültige Anfrage.')
    const { password, salt, params } = request as Partial<KdfRequest>
    if (!(password instanceof ArrayBuffer) || !(salt instanceof ArrayBuffer)) {
      throw new CryptoFormatError('Ungültige Anfrage.')
    }
    const key = await deriveKekFromBytes(new Uint8Array(password), new Uint8Array(salt), params)
    return { ok: true, key }
  } catch (error) {
    if (error instanceof CryptoFormatError) return { ok: false, code: 'invalid-input' }
    if (error instanceof CryptoUnavailableError) return { ok: false, code: 'unavailable' }
    return { ok: false, code: 'kdf-failed' }
  }
}
