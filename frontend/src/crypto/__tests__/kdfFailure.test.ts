// Fehlerverhalten der Ableitung, wenn die Argon2id-Bibliothek scheitert (z. B. zu wenig Speicher).

import { describe, expect, it, vi } from 'vitest'

vi.mock('@noble/hashes/argon2.js', () => ({
  argon2id: () => {
    throw new RangeError('Array buffer allocation failed: GEHEIMES-PASSWORT-im-Fehlertext')
  },
}))

import { CryptoError, KdfError } from '../errors'
import { deriveKek, inlineRunner } from '../kdf'
import { handleKdfRequest } from '../kdfCore'
import { MIN_PARAMS, sequence } from './helpers'

describe('Speicher- und Bibliotheksfehler', () => {
  it('wird zu einem allgemeinen KdfError ohne Details aus der Bibliothek', async () => {
    const error = await deriveKek('GEHEIMES-PASSWORT', sequence(16), MIN_PARAMS, { runner: inlineRunner }).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(KdfError)
    expect(error).toBeInstanceOf(CryptoError)
    expect((error as KdfError).code).toBe('kdf-failed')
    expect(error!.name).toBe('KdfError')
    expect(error!.message).not.toContain('GEHEIMES')
    expect(error!.message).not.toContain('allocation')
    expect((error as { cause?: unknown }).cause).toBeUndefined()
  })

  it('der Worker-Kern meldet nur den Code und überschreibt das Passwort trotzdem', async () => {
    const password = new Uint8Array(sequence(10, 5)).buffer as ArrayBuffer
    const response = await handleKdfRequest({ password, salt: new Uint8Array(sequence(16)).buffer, params: MIN_PARAMS })
    expect(response).toEqual({ ok: false, code: 'kdf-failed' })
    expect(new Uint8Array(password).every((b) => b === 0)).toBe(true)
  })
})
