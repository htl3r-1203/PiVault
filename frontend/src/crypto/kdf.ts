// Ableitung des Key Encryption Key (KEK) aus dem Masterpasswort: Argon2id im Web Worker.
//
//   Masterpasswort --NFKC/UTF-8--> Argon2id(Salt, m/t/p) --> 32 Byte --> AES-256-Schlüssel (KEK)
//
// Der KEK ist nicht extrahierbar und darf nur Schlüssel ein-/auspacken (siehe kdfCore.ts).
// Bibliothek: @noble/hashes 2.4.0 (Begründung und Einschränkungen: siehe KAN-44-Dokumentation/Abschlussbericht).
//
// Hauptthread: Das Passwort wird als Text eingegeben (ein JavaScript-String lässt sich nicht
// überschreiben). Die daraus erzeugten UTF-8-Bytes werden an den Worker ÜBERTRAGEN (nicht kopiert) und dort
// nach der Ableitung überschrieben. Ohne Worker-Unterstützung (z. B. Tests unter Node) läuft die Ableitung
// im selben Thread.

import { zeroize } from './encoding'
import { CryptoFormatError, CryptoUnavailableError, KdfError } from './errors'
import { handleKdfRequest, type KdfResponse } from './kdfCore'
import { DEFAULT_KDF_PARAMS, SALT_BYTES, normalizePassword, validateKdfParams, validateSalt, type KdfParams } from './kdfParams'
import { randomBytes } from './random'

export { DEFAULT_KDF_PARAMS, KDF_LIMITS, SALT_BYTES, validateKdfParams } from './kdfParams'
export type { KdfParams } from './kdfParams'

export interface KdfRunRequest {
  password: Uint8Array
  salt: Uint8Array
  params: KdfParams
}

/** Führt eine Ableitung aus. Austauschbar, damit Tests ohne Worker laufen. */
export type KdfRunner = (request: KdfRunRequest) => Promise<CryptoKey>

function toResult(response: KdfResponse): CryptoKey {
  if (response.ok) return response.key
  if (response.code === 'invalid-input') throw new CryptoFormatError('Die Eingaben für die Schlüsselableitung sind ungültig.')
  if (response.code === 'unavailable') {
    throw new CryptoUnavailableError('Web Crypto ist nicht verfügbar (HTTPS oder localhost erforderlich).')
  }
  throw new KdfError()
}

/** Ableitung im aktuellen Thread (Tests, Umgebungen ohne Worker). Blockiert während der Berechnung. */
export const inlineRunner: KdfRunner = async ({ password, salt, params }) =>
  toResult(await handleKdfRequest({ password: new Uint8Array(password).buffer, salt: new Uint8Array(salt).buffer, params }))

/** Ableitung in einem frischen Web Worker, der danach sofort beendet wird. */
export const workerRunner: KdfRunner = ({ password, salt, params }) =>
  new Promise<CryptoKey>((resolve, reject) => {
    let worker: Worker
    // Eigene Puffer, die an den Worker übertragen (und damit hier ungültig) werden
    const passwordCopy = new Uint8Array(password)
    const saltCopy = new Uint8Array(salt)
    try {
      worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      zeroize(passwordCopy)
      reject(new KdfError())
      return
    }
    const done = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<KdfResponse>) => {
      done()
      try {
        resolve(toResult(event.data))
      } catch (error) {
        reject(error)
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      done()
      reject(new KdfError())
    }
    worker.onmessageerror = () => {
      done()
      reject(new KdfError())
    }
    worker.postMessage({ password: passwordCopy.buffer, salt: saltCopy.buffer, params }, [passwordCopy.buffer, saltCopy.buffer])
  })

export const defaultRunner = (): KdfRunner => (typeof Worker !== 'undefined' ? workerRunner : inlineRunner)

/** Neues zufälliges Salt (16 Byte) */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES)
}

/**
 * Leitet den KEK aus dem Masterpasswort ab. Prüft Passwort, Salt und Parameter streng, bevor gerechnet
 * wird. Wirft CryptoFormatError (ungültige Eingaben/Parameter), KdfError (technischer Fehler) oder
 * CryptoUnavailableError (kein sicherer Kontext).
 */
export async function deriveKek(
  masterPassword: string,
  salt: Uint8Array,
  params: unknown,
  options: { runner?: KdfRunner } = {},
): Promise<CryptoKey> {
  const checkedParams = validateKdfParams(params)
  validateSalt(salt)
  const passwordBytes = normalizePassword(masterPassword)
  try {
    return await (options.runner ?? defaultRunner())({ password: passwordBytes, salt: new Uint8Array(salt), params: checkedParams })
  } finally {
    zeroize(passwordBytes)
  }
}

/**
 * Misst, wie lange eine Ableitung mit diesen Parametern auf DIESEM Gerät dauert (Millisekunden, inklusive
 * Worker-Start). Dient dazu, die Parameter auf echten Zielgeräten zu überprüfen. Verwendet ein
 * Wegwerf-Passwort, nie ein echtes.
 */
export async function benchmarkKdf(params: unknown = DEFAULT_KDF_PARAMS, options: { runner?: KdfRunner } = {}): Promise<number> {
  const start = performance.now()
  await deriveKek('benchmark-only-not-a-real-password', generateSalt(), params, options)
  return performance.now() - start
}
