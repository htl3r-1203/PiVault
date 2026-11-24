// Öffentliche Schnittstelle des clientseitigen Kryptografie-Kerns (KAN-44, Schritt 1).
// Andere Module importieren nur aus '@/crypto', nicht aus den Einzeldateien.
//
// Bewusst noch NICHT enthalten (spätere Schritte): Argon2id-Schlüsselableitung, Schlüsselverpackung des
// Tresorschlüssels, Schlüsselverwaltung/Sperre, Masterpasswort-UI, API-Anbindung.

export { AES_KEY_BYTES, decrypt, encrypt, generateAesKey, importAesKey, isCryptoAvailable } from './aesGcm'
export {
  DEFAULT_MAX_DECODED_BYTES,
  base64urlDecode,
  base64urlEncode,
  utf8Decode,
  utf8Encode,
  zeroize,
} from './encoding'
export { CryptoError, CryptoFormatError, CryptoUnavailableError, DecryptionError } from './errors'
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
