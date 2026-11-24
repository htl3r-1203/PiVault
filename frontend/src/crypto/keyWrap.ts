// Schlüsselverpackung (Key Wrapping): Vault Key <-> Masterpasswort.
//
//   Masterpasswort --Argon2id(Salt, Parameter)--> KEK (AES-256, nur wrapKey/unwrapKey, nicht extrahierbar)
//   Vault Key (AES-256, zufällig) --AES-256-GCM(KEK, Nonce, AAD)--> encryptedVaultKey (32 B) + Tag (16 B)
//
// Die fünf Werte des VaultKeyBundle entsprechen 1:1 den Feldern in users (database/schema.sql):
//   kdfSalt -> master_kdf_salt, kdfParams -> master_kdf_params, encryptedVaultKey -> encrypted_vault_key,
//   nonce -> vault_key_nonce, tag -> vault_key_tag.
//
// Ablauf Einrichten (createVaultKey):
//   1. Salt zufällig erzeugen, KEK ableiten.
//   2. Vault Key per Web Crypto erzeugen (extrahierbar, NUR damit wrapKey ihn exportieren kann; die
//      Rohbytes erscheinen dabei nie im JavaScript-Speicher).
//   3. wrapKey('raw') mit KEK, frischer Nonce und AAD (Zweck "vault-key", Benutzer-ID, Version).
//   4. Sofort per unwrapKey wieder entpacken: Ergebnis ist der nicht extrahierbare Vault Key für den
//      Betrieb. Das ist zugleich ein Selbsttest. Der extrahierbare Schlüssel wird verworfen.
// Ablauf Entsperren (unlockVaultKey): KEK ableiten, unwrapKey mit extractable = false. Es entstehen keine
//   Rohbytes des Vault Keys in JavaScript.
//
// Warum zwei Zustände des Vault Keys? Ein nicht extrahierbarer CryptoKey kann nicht mit wrapKey() exportiert
// werden. Das Verpacken braucht deshalb einmalig eine extrahierbare Fassung (nur beim Einrichten). Für den
// Alltag wird ausschließlich die nicht extrahierbare Fassung benutzt. Beim späteren Ändern des
// Masterpassworts wird der Vault Key mit dem ALTEN Passwort kurz extrahierbar entpackt (Option
// `extractable`), mit dem neuen KEK neu verpackt und danach verworfen.
//
// Version: kdfParams.v gibt zugleich die Formatversion der Verpackung an (v = 1: Argon2id + AES-256-GCM mit
// dem AAD-Format aus format.ts, Version 1). Das Schema hat keine eigene Versionsspalte für diesen Block.
//
// Authentifizierung der Metadaten: Das AAD enthält Formatversion, Zweck und Benutzer-ID. Salt und
// KDF-Parameter fließen in den KEK ein; wer sie verändert, erzeugt einen anderen KEK, und das Entpacken
// scheitert an der GCM-Authentifizierung. Ein Fehler lässt sich nicht von einem falschen Passwort
// unterscheiden (DecryptionError). Nicht erkennbar: Zurückspielen eines früheren, gültigen Bundles.

import { assertBytes } from './encoding'
import { getSubtle } from './aesGcm'
import { CryptoFormatError, CryptoUnavailableError, DecryptionError, KdfError } from './errors'
import { NONCE_BYTES, TAG_BYTES, buildAad } from './format'
import { DEFAULT_KDF_PARAMS, deriveKek, generateSalt, validateKdfParams, type KdfParams, type KdfRunner } from './kdf'
import { validateSalt } from './kdfParams'
import { generateNonce } from './random'

/** Länge des verpackten Vault Keys (AES-256) */
export const WRAPPED_KEY_BYTES = 32

export interface VaultKeyBundle {
  kdfSalt: Uint8Array
  kdfParams: KdfParams
  encryptedVaultKey: Uint8Array
  nonce: Uint8Array
  tag: Uint8Array
}

export interface WrapOptions {
  runner?: KdfRunner
}

function exactBytes(value: unknown, length: number, name: string): Uint8Array {
  assertBytes(value, name)
  if (value.length !== length) throw new CryptoFormatError(`${name} hat nicht die erwartete Länge von ${length} Byte.`)
  return new Uint8Array(value)
}

/** Prüft ein Bundle streng (Typen, Längen, Parameter) und liefert eine Kopie. */
export function validateBundle(input: unknown): VaultKeyBundle {
  if (typeof input !== 'object' || input === null) throw new CryptoFormatError('Das Schlüsselpaket fehlt.')
  const b = input as Record<string, unknown>
  validateSalt(b.kdfSalt)
  return {
    kdfSalt: new Uint8Array(b.kdfSalt),
    kdfParams: validateKdfParams(b.kdfParams),
    encryptedVaultKey: exactBytes(b.encryptedVaultKey, WRAPPED_KEY_BYTES, 'Der verpackte Schlüssel'),
    nonce: exactBytes(b.nonce, NONCE_BYTES, 'Die Nonce'),
    tag: exactBytes(b.tag, TAG_BYTES, 'Der Tag'),
  }
}

function gcmParams(nonce: Uint8Array, aad: Uint8Array): AesGcmParams {
  return { name: 'AES-GCM', iv: new Uint8Array(nonce), additionalData: new Uint8Array(aad), tagLength: TAG_BYTES * 8 }
}

async function unwrapWith(kek: CryptoKey, bundle: VaultKeyBundle, userId: number, extractable: boolean): Promise<CryptoKey> {
  const aad = buildAad(bundle.kdfParams.v, { purpose: 'vault-key', userId })
  const data = new Uint8Array(WRAPPED_KEY_BYTES + TAG_BYTES)
  data.set(bundle.encryptedVaultKey, 0)
  data.set(bundle.tag, WRAPPED_KEY_BYTES)
  try {
    return await getSubtle().unwrapKey('raw', data, kek, gcmParams(bundle.nonce, aad), { name: 'AES-GCM' }, extractable, [
      'encrypt',
      'decrypt',
    ])
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error
    // Bewusst keine Unterscheidung: falsches Passwort, falsche Parameter/Salt, manipulierte Daten
    throw new DecryptionError()
  }
}

/**
 * Richtet einen neuen Tresorschlüssel ein: erzeugt Salt und Vault Key, verpackt ihn mit dem aus dem
 * Masterpasswort abgeleiteten KEK und liefert das zu speichernde Bundle sowie den nicht extrahierbaren
 * Vault Key für die laufende Sitzung. `userId` muss die ID des angemeldeten Benutzers sein (AAD).
 */
export async function createVaultKey(
  masterPassword: string,
  userId: number,
  options: WrapOptions & { params?: unknown } = {},
): Promise<{ bundle: VaultKeyBundle; vaultKey: CryptoKey }> {
  const params = validateKdfParams(options.params ?? DEFAULT_KDF_PARAMS)
  const nonce = generateNonce()
  const aad = buildAad(params.v, { purpose: 'vault-key', userId }) // prüft Version und Benutzer-ID vorab
  const kdfSalt = generateSalt()
  const kek = await deriveKek(masterPassword, kdfSalt, params, { runner: options.runner })

  const subtle = getSubtle()
  let wrapped: Uint8Array
  try {
    // Extrahierbar nur, damit wrapKey ihn exportieren kann; Rohbytes sind für JavaScript nicht sichtbar
    const temporary = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    wrapped = new Uint8Array(await subtle.wrapKey('raw', temporary, kek, gcmParams(nonce, aad)))
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error
    throw new KdfError()
  }
  if (wrapped.length !== WRAPPED_KEY_BYTES + TAG_BYTES) throw new KdfError()

  const bundle: VaultKeyBundle = {
    kdfSalt,
    kdfParams: params,
    encryptedVaultKey: wrapped.slice(0, WRAPPED_KEY_BYTES),
    nonce,
    tag: wrapped.slice(WRAPPED_KEY_BYTES),
  }
  // Selbsttest und Gewinnung der nicht extrahierbaren Betriebsfassung in einem Schritt
  const vaultKey = await unwrapWith(kek, bundle, userId, false)
  return { bundle, vaultKey }
}

/**
 * Entsperrt: leitet den KEK ab und entpackt den Vault Key. Das Ergebnis ist standardmäßig NICHT
 * extrahierbar (extractable: false). `extractable: true` ist ausschließlich für das Ändern des
 * Masterpassworts gedacht und muss nach dem Neuverpacken sofort verworfen werden.
 *
 * Wirft DecryptionError bei falschem Passwort, falschen/manipulierten Parametern oder Daten,
 * CryptoFormatError bei ungültigem Bundle (inkl. Parametern außerhalb der Grenzen), KdfError bei
 * technischem Fehler der Ableitung.
 */
export async function unlockVaultKey(
  masterPassword: string,
  userId: number,
  bundle: unknown,
  options: WrapOptions & { extractable?: boolean } = {},
): Promise<CryptoKey> {
  const checked = validateBundle(bundle)
  buildAad(checked.kdfParams.v, { purpose: 'vault-key', userId }) // Benutzer-ID früh prüfen
  const kek = await deriveKek(masterPassword, checked.kdfSalt, checked.kdfParams, { runner: options.runner })
  return unwrapWith(kek, checked, userId, options.extractable === true)
}
