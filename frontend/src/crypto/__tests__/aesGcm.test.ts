import { afterEach, describe, expect, it, vi } from 'vitest'
import { AES_KEY_BYTES, decrypt, encrypt, generateAesKey, importAesKey, isCryptoAvailable } from '../aesGcm'
import { utf8Decode, utf8Encode, zeroize } from '../encoding'
import { CryptoError, CryptoFormatError, CryptoUnavailableError, DecryptionError } from '../errors'
import {
  MAX_PLAINTEXT_BYTES,
  decodeBlob,
  encodeBlob,
  type EncryptedBlob,
  type EncryptionContext,
} from '../format'
import { flipBit, sequence, toHex } from './helpers'

const ENTRY: EncryptionContext = { purpose: 'entry', userId: 1, vaultId: 2, entryId: 3 }
const PLAINTEXT = utf8Encode('{"name":"Beispiel","password":"DEMO-nicht-echt-äöü-🔐"}')

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const clone = (blob: EncryptedBlob, changes: Partial<EncryptedBlob> = {}): EncryptedBlob => ({
  version: blob.version,
  nonce: new Uint8Array(blob.nonce),
  ciphertext: new Uint8Array(blob.ciphertext),
  tag: new Uint8Array(blob.tag),
  ...changes,
})

async function expectDecryptionError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(DecryptionError)
  expect((error as DecryptionError).code).toBe('decryption-failed')
}

describe('Fehlernamen (stabil, auch im minifizierten Build)', () => {
  it('jede Fehlerklasse hat einen festen Namen', () => {
    expect(new CryptoFormatError('x').name).toBe('CryptoFormatError')
    expect(new CryptoUnavailableError('x').name).toBe('CryptoUnavailableError')
    expect(new DecryptionError().name).toBe('DecryptionError')
  })
})

describe('Roundtrip', () => {
  it('entschlüsselt, was verschlüsselt wurde', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    expect(blob.version).toBe(1)
    expect(blob.nonce).toHaveLength(12)
    expect(blob.tag).toHaveLength(16)
    expect(blob.ciphertext).toHaveLength(PLAINTEXT.length)
    expect(utf8Decode(await decrypt(key, blob, ENTRY))).toBe(utf8Decode(PLAINTEXT))
  })

  it('funktioniert für alle Zwecke und für 1 Byte sowie die Maximalgröße', async () => {
    const key = await generateAesKey()
    const contexts: EncryptionContext[] = [
      { purpose: 'vault-key', userId: 1 },
      { purpose: 'vault-name', userId: 1, vaultId: 2 },
      { purpose: 'vault-description', userId: 1, vaultId: 2 },
      ENTRY,
    ]
    for (const context of contexts) {
      for (const size of [1, 16, 1000, MAX_PLAINTEXT_BYTES]) {
        const data = new Uint8Array(size).fill(0x41)
        const blob = await encrypt(key, data, context)
        expect(Array.from(await decrypt(key, blob, context))).toEqual(Array.from(data))
      }
    }
  })

  it('Chiffretext enthält den Klartext nicht', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, utf8Encode('GEHEIMGEHEIMGEHEIM'), ENTRY)
    expect(toHex(blob.ciphertext)).not.toContain(toHex(utf8Encode('GEHEIM')))
  })

  it('übersteht die Serialisierung (Base64url) zwischen Verschlüsseln und Entschlüsseln', async () => {
    const key = await generateAesKey()
    const text = encodeBlob(await encrypt(key, PLAINTEXT, ENTRY))
    expect(utf8Decode(await decrypt(key, decodeBlob(text), ENTRY))).toBe(utf8Decode(PLAINTEXT))
  })

  it('erzeugt bei gleichem Klartext und Schlüssel jedes Mal eine andere Nonce und einen anderen Chiffretext', async () => {
    const key = await generateAesKey()
    const a = await encrypt(key, PLAINTEXT, ENTRY)
    const b = await encrypt(key, PLAINTEXT, ENTRY)
    expect(toHex(a.nonce)).not.toBe(toHex(b.nonce))
    expect(toHex(a.ciphertext)).not.toBe(toHex(b.ciphertext))
  })

  it('erzeugt in 500 Verschlüsselungen keine doppelte Nonce', async () => {
    const key = await generateAesKey()
    const nonces = new Set<string>()
    for (let i = 0; i < 500; i++) nonces.add(toHex((await encrypt(key, PLAINTEXT, ENTRY)).nonce))
    expect(nonces.size).toBe(500)
  })

  it('verändert Eingabedaten nicht und hält keine Verbindung zu ihnen', async () => {
    const key = await generateAesKey()
    const input = new Uint8Array(PLAINTEXT)
    const blob = await encrypt(key, input, ENTRY)
    expect(Array.from(input)).toEqual(Array.from(PLAINTEXT))
    zeroize(input)
    expect(utf8Decode(await decrypt(key, blob, ENTRY))).toBe(utf8Decode(PLAINTEXT))
  })

  it('importierter Rohschlüssel verhält sich wie ein erzeugter', async () => {
    const raw = sequence(AES_KEY_BYTES, 9)
    const a = await importAesKey(raw)
    const b = await importAesKey(raw)
    const blob = await encrypt(a, PLAINTEXT, ENTRY)
    expect(utf8Decode(await decrypt(b, blob, ENTRY))).toBe(utf8Decode(PLAINTEXT))
  })
})

describe('falscher Schlüssel', () => {
  it('führt zu DecryptionError', async () => {
    const blob = await encrypt(await generateAesKey(), PLAINTEXT, ENTRY)
    await expectDecryptionError(decrypt(await generateAesKey(), blob, ENTRY))
  })

  it('schon ein einziges Bit Unterschied im Schlüssel genügt', async () => {
    const raw = sequence(32, 1)
    const blob = await encrypt(await importAesKey(raw), PLAINTEXT, ENTRY)
    await expectDecryptionError(decrypt(await importAesKey(flipBit(raw, 31)), blob, ENTRY))
  })
})

describe('manipulierte Daten', () => {
  it('jede Änderung von Chiffretext, Tag oder Nonce wird erkannt (alle Byte-Positionen)', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, utf8Encode('kurzer Klartext'), ENTRY)
    for (let i = 0; i < blob.ciphertext.length; i++) {
      await expectDecryptionError(decrypt(key, clone(blob, { ciphertext: flipBit(blob.ciphertext, i) }), ENTRY))
    }
    for (let i = 0; i < blob.tag.length; i++) {
      await expectDecryptionError(decrypt(key, clone(blob, { tag: flipBit(blob.tag, i) }), ENTRY))
    }
    for (let i = 0; i < blob.nonce.length; i++) {
      await expectDecryptionError(decrypt(key, clone(blob, { nonce: flipBit(blob.nonce, i) }), ENTRY))
    }
  })

  it('verkürzter und verlängerter Chiffretext werden erkannt', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expectDecryptionError(decrypt(key, clone(blob, { ciphertext: blob.ciphertext.slice(0, -1) }), ENTRY))
    const longer = new Uint8Array(blob.ciphertext.length + 1)
    longer.set(blob.ciphertext)
    await expectDecryptionError(decrypt(key, clone(blob, { ciphertext: longer }), ENTRY))
  })

  it('vertauschte Teile zweier Blöcke werden erkannt', async () => {
    const key = await generateAesKey()
    const a = await encrypt(key, PLAINTEXT, ENTRY)
    const b = await encrypt(key, PLAINTEXT, ENTRY)
    await expectDecryptionError(decrypt(key, clone(a, { tag: b.tag }), ENTRY))
    await expectDecryptionError(decrypt(key, clone(a, { nonce: b.nonce }), ENTRY))
  })

  it('liefert nie ein Teilergebnis und gibt keine Daten in der Fehlermeldung preis', async () => {
    const key = await generateAesKey()
    const secret = 'SEHR-GEHEIMES-PASSWORT'
    const blob = await encrypt(key, utf8Encode(secret), ENTRY)
    const error = await decrypt(key, clone(blob, { tag: flipBit(blob.tag, 0) }), ENTRY).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(DecryptionError)
    expect(error!.message).not.toContain(secret)
    expect(error!.message).not.toContain(toHex(blob.nonce))
    expect((error as { cause?: unknown }).cause).toBeUndefined()
  })
})

describe('falsches AAD / falscher Kontext', () => {
  it.each([
    ['anderer Benutzer', { purpose: 'entry', userId: 99, vaultId: 2, entryId: 3 }],
    ['anderer Tresor', { purpose: 'entry', userId: 1, vaultId: 99, entryId: 3 }],
    ['anderer Eintrag', { purpose: 'entry', userId: 1, vaultId: 2, entryId: 99 }],
    ['anderer Zweck', { purpose: 'vault-name', userId: 1, vaultId: 2 }],
  ] as [string, EncryptionContext][])('wird abgelehnt: %s', async (_name, other) => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expectDecryptionError(decrypt(key, blob, other))
  })

  it('geänderte Formatversion im Block wird abgelehnt, bevor entschlüsselt wird', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    const spy = vi.spyOn(globalThis.crypto.subtle, 'decrypt')
    await expect(decrypt(key, clone(blob, { version: 2 }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('ungültiger Kontext (z. B. fehlende ID) wirft CryptoFormatError, nicht DecryptionError', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    const broken = { purpose: 'entry', userId: 1, vaultId: 2 } as unknown as EncryptionContext
    await expect(decrypt(key, blob, broken)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(encrypt(key, PLAINTEXT, broken)).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('ungültige Nonce und Blockfelder', () => {
  it.each([0, 1, 11, 13, 16, 32])('lehnt eine Nonce mit %i Byte ab', async (length) => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expect(decrypt(key, clone(blob, { nonce: new Uint8Array(length) }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })

  it.each([0, 1, 15, 17, 32])('lehnt einen Tag mit %i Byte ab', async (length) => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expect(decrypt(key, clone(blob, { tag: new Uint8Array(length) }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })

  it('lehnt Felder falschen Typs, leeren Chiffretext und fehlenden Block ab', async () => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expect(decrypt(key, clone(blob, { nonce: [...blob.nonce] as unknown as Uint8Array }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(decrypt(key, clone(blob, { ciphertext: new Uint8Array(0) }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(decrypt(key, null as unknown as EncryptedBlob, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })

  it('encrypt() nimmt keine Nonce von außen an', async () => {
    const key = await generateAesKey()
    const injected = sequence(12, 200)
    const looseEncrypt = encrypt as unknown as (...args: unknown[]) => Promise<EncryptedBlob>
    const blob = await looseEncrypt(key, PLAINTEXT, ENTRY, { nonce: injected })
    expect(toHex(blob.nonce)).not.toBe(toHex(injected))
  })
})

describe('ungültige Formatversion', () => {
  it.each([0, 2, 99, -1, 1.5, NaN, '1' as unknown as number])('lehnt Version %j ab', async (version) => {
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await expect(decrypt(key, clone(blob, { version }), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('Schlüsselprüfung', () => {
  it.each([0, 1, 16, 24, 31, 33, 64])('importAesKey lehnt %i Byte ab', async (length) => {
    await expect(importAesKey(new Uint8Array(length))).rejects.toBeInstanceOf(CryptoFormatError)
  })

  it('importAesKey lehnt Nicht-Bytes ab', async () => {
    await expect(importAesKey('x'.repeat(32) as unknown as Uint8Array)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(importAesKey(Array.from(sequence(32)) as unknown as Uint8Array)).rejects.toBeInstanceOf(CryptoFormatError)
  })

  it('Schlüssel sind standardmäßig nicht extrahierbar', async () => {
    const generated = await generateAesKey()
    const imported = await importAesKey(sequence(32))
    expect(generated.extractable).toBe(false)
    expect(imported.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', imported)).rejects.toBeDefined()
    expect((await generateAesKey({ extractable: true })).extractable).toBe(true)
  })

  it('lehnt AES-128-, HMAC- und Nicht-Schlüssel ab', async () => {
    const aes128 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt'])
    const hmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    for (const key of [aes128, hmac, null, undefined, 'key', {}, sequence(32)]) {
      await expect(encrypt(key as CryptoKey, PLAINTEXT, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    }
  })

  it('lehnt Schlüssel ohne passende Berechtigung ab', async () => {
    const onlyDecrypt = await crypto.subtle.importKey('raw', sequence(32), { name: 'AES-GCM' }, false, ['decrypt'])
    const onlyEncrypt = await crypto.subtle.importKey('raw', sequence(32), { name: 'AES-GCM' }, false, ['encrypt'])
    const blob = await encrypt(onlyEncrypt, PLAINTEXT, ENTRY)
    await expect(encrypt(onlyDecrypt, PLAINTEXT, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(decrypt(onlyEncrypt, blob, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('Klartext-Prüfung', () => {
  it('lehnt leeren, zu großen und falsch typisierten Klartext ab', async () => {
    const key = await generateAesKey()
    await expect(encrypt(key, new Uint8Array(0), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(encrypt(key, new Uint8Array(MAX_PLAINTEXT_BYTES + 1), ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(encrypt(key, 'text' as unknown as Uint8Array, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(encrypt(key, undefined as unknown as Uint8Array, ENTRY)).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('sicherer Kontext', () => {
  it('meldet fehlendes crypto.subtle (HTTP) mit klarem Hinweis', async () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    vi.stubGlobal('isSecureContext', false)
    expect(isCryptoAvailable()).toBe(false)
    const error = await generateAesKey().then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(CryptoUnavailableError)
    expect(error).toBeInstanceOf(CryptoError)
    expect(error!.message).toContain('HTTPS')
  })

  it('meldet fehlendes crypto.subtle auch ohne isSecureContext-Angabe', async () => {
    vi.stubGlobal('crypto', undefined)
    expect(isCryptoAvailable()).toBe(false)
    await expect(importAesKey(sequence(32))).rejects.toBeInstanceOf(CryptoUnavailableError)
  })

  it('meldet die Verfügbarkeit, wenn Web Crypto da ist', () => {
    expect(isCryptoAvailable()).toBe(true)
  })
})

describe('keine Protokollierung von Geheimnissen', () => {
  it('Erfolg und Fehlerfälle schreiben nichts in die Konsole', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) => vi.spyOn(console, m))
    const key = await generateAesKey()
    const blob = await encrypt(key, PLAINTEXT, ENTRY)
    await decrypt(key, blob, ENTRY)
    await decrypt(await generateAesKey(), blob, ENTRY).catch(() => undefined)
    await decrypt(key, clone(blob, { version: 9 }), ENTRY).catch(() => undefined)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
