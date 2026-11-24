// Fehlerklassen des Kryptografie-Kerns.
//
// Die Meldungen sind absichtlich allgemein: Sie enthalten nie Klartext, Schlüssel, Nonces, Chiffretext
// oder Kontextwerte. Der Aufrufer kann am Typ (bzw. an `code`) unterscheiden, was schiefging, und
// entscheidet selbst, was der Benutzer zu sehen bekommt.

export type CryptoErrorCode = 'unavailable' | 'invalid-input' | 'decryption-failed' | 'kdf-failed'

export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode, message: string) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
  }
}

/** Web Crypto bzw. der Zufallsgenerator fehlt (typisch: kein sicherer Kontext, also HTTP statt HTTPS) */
export class CryptoUnavailableError extends CryptoError {
  constructor(message: string) {
    super('unavailable', message)
    this.name = 'CryptoUnavailableError'
  }
}

/** Eingaben, Schlüssel, Kontext oder Datenformat sind ungültig. Es wurde nichts ver- oder entschlüsselt. */
export class CryptoFormatError extends CryptoError {
  constructor(message: string) {
    super('invalid-input', message)
    this.name = 'CryptoFormatError'
  }
}

/**
 * Entschlüsselung abgelehnt. AES-GCM unterscheidet bewusst nicht zwischen falschem Schlüssel, falschem
 * Kontext (AAD) und manipulierten Daten; dieser Fehler tut es ebenfalls nicht. Ein Teilergebnis gibt es nie.
 */
export class DecryptionError extends CryptoError {
  constructor() {
    super(
      'decryption-failed',
      'Die Daten konnten nicht entschlüsselt werden (falscher Schlüssel, falscher Kontext oder beschädigte Daten).',
    )
    this.name = 'DecryptionError'
  }
}

/**
 * Die Schlüsselableitung (Argon2id) ist technisch gescheitert, z. B. wegen zu wenig Arbeitsspeicher oder
 * weil der Worker nicht arbeiten konnte. Die Meldung enthält keine Eingaben und keine Parameterwerte.
 */
export class KdfError extends CryptoError {
  constructor() {
    super('kdf-failed', 'Die Schlüsselableitung ist fehlgeschlagen (z. B. zu wenig Arbeitsspeicher auf diesem Gerät).')
    this.name = 'KdfError'
  }
}
