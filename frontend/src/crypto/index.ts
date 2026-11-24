// Öffentliche Schnittstelle des clientseitigen Kryptografie-Kerns (KAN-44, Schritt 1).
// Andere Module importieren nur aus '@/crypto', nicht aus den Einzeldateien.
//
// Schritt 2 ergänzt: Argon2id-Schlüsselableitung (Web Worker) und Verpackung des Tresorschlüssels.
// Bewusst noch NICHT enthalten (spätere Schritte): Schlüsselverwaltung/Sperre, Masterpasswort-UI,
// Masterpasswort ändern, API-Anbindung.

export { AES_KEY_BYTES, decrypt, encrypt, generateAesKey, importAesKey, isCryptoAvailable } from './aesGcm'
export { DEFAULT_KDF_PARAMS, KDF_LIMITS, SALT_BYTES, benchmarkKdf, deriveKek, generateSalt, validateKdfParams } from './kdf'
export type { KdfParams } from './kdf'
export { MAX_PASSWORD_BYTES, normalizePassword } from './kdfParams'
export { WRAPPED_KEY_BYTES, createVaultKey, unlockVaultKey, validateBundle } from './keyWrap'
export type { VaultKeyBundle } from './keyWrap'
export {
  DEFAULT_MAX_DECODED_BYTES,
  base64urlDecode,
  base64urlEncode,
  utf8Decode,
  utf8Encode,
  zeroize,
} from './encoding'
export { CryptoError, CryptoFormatError, CryptoUnavailableError, DecryptionError, KdfError } from './errors'
export type { CryptoErrorCode } from './errors'
export {
  AAD_BYTES,
  CURRENT_FORMAT_VERSION,
  MAX_PLAINTEXT_BYTES,
  NONCE_BYTES,
  SUPPORTED_FORMAT_VERSIONS,
  TAG_BYTES,
  buildAad,
  decodeBlob,
  encodeBlob,
  parseBlob,
  serializeBlob,
} from './format'
export type { EncryptedBlob, EncryptionContext, EncryptionPurpose } from './format'
export { MAX_RANDOM_BYTES, generateNonce, randomBytes } from './random'
