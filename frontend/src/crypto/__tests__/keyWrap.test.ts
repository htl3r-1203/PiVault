import { describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt, generateAesKey } from '../aesGcm'
import { utf8Decode, utf8Encode } from '../encoding'
import { CryptoError, CryptoFormatError, DecryptionError } from '../errors'
import { DEFAULT_KDF_PARAMS, deriveKek, inlineRunner, type KdfRunner } from '../kdf'
import { WRAPPED_KEY_BYTES, createVaultKey, unlockVaultKey, validateBundle, type VaultKeyBundle } from '../keyWrap'
import type { EncryptionContext } from '../format'
import { MIN_PARAMS, fakeRunner, flipBit, sequence, toHex } from './helpers'

const USER = 42
const PASSWORD = 'Mein-Test-Masterpasswort-äöü'
const ENTRY: EncryptionContext = { purpose: 'entry', userId: USER, vaultId: 1, entryId: 1 }

// Schnell (Ersatz-KDF), wenn nicht die KDF selbst geprüft wird
const fast = { runner: fakeRunner, params: MIN_PARAMS }

const copyBundle = (b: VaultKeyBundle, change: Partial<VaultKeyBundle> = {}): VaultKeyBundle => ({
  kdfSalt: new Uint8Array(b.kdfSalt),
  kdfParams: { ...b.kdfParams },
  encryptedVaultKey: new Uint8Array(b.encryptedVaultKey),
  nonce: new Uint8Array(b.nonce),
  tag: new Uint8Array(b.tag),
  ...change,
})

const rejectsWith = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: unknown) => e as Error,
  )

describe('Einrichten (createVaultKey) mit echtem Argon2id', () => {
  it('Roundtrip: eingerichteter und entsperrter Schlüssel sind derselbe und verschlüsseln Daten', async () => {
    const { bundle, vaultKey } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner, params: MIN_PARAMS })
    const unlocked = await unlockVaultKey(PASSWORD, USER, bundle, { runner: inlineRunner })

    const blob = await encrypt(vaultKey, utf8Encode('Daten'), ENTRY)
    expect(utf8Decode(await decrypt(unlocked, blob, ENTRY))).toBe('Daten')
    const blob2 = await encrypt(unlocked, utf8Encode('mehr'), ENTRY)
    expect(utf8Decode(await decrypt(vaultKey, blob2, ENTRY))).toBe('mehr')
  })

  it('Standardparameter: Bundle hat die Längen der Datenbankfelder und die dokumentierten Parameter', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner })
    expect(bundle.kdfSalt).toHaveLength(16)
    expect(bundle.encryptedVaultKey).toHaveLength(32)
    expect(bundle.nonce).toHaveLength(12)
    expect(bundle.tag).toHaveLength(16)
    expect(bundle.kdfParams).toEqual(DEFAULT_KDF_PARAMS)
    expect(bundle.kdfParams).toEqual({ v: 1, alg: 'argon2id', m: 32_768, t: 3, p: 1, len: 32 })
  })

  it('der Vault Key ist nach dem Einrichten und nach dem Entsperren nicht extrahierbar', async () => {
    const { bundle, vaultKey } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner, params: MIN_PARAMS })
    const unlocked = await unlockVaultKey(PASSWORD, USER, bundle, { runner: inlineRunner })
    for (const key of [vaultKey, unlocked]) {
      expect(key.extractable).toBe(false)
      expect(key.type).toBe('secret')
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
      expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt'])
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeDefined()
    }
  })

  it('falsches Masterpasswort -> DecryptionError', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner, params: MIN_PARAMS })
    const error = await rejectsWith(unlockVaultKey(PASSWORD + '!', USER, bundle, { runner: inlineRunner }))
    expect(error).toBeInstanceOf(DecryptionError)
    expect(error!.message).not.toContain(PASSWORD)
  })

  it('zusammengesetzte/zerlegte Umlaute im Masterpasswort sind austauschbar (NFKC)', async () => {
    const { bundle, vaultKey } = await createVaultKey('Müller-Paßwort-123', USER, { runner: inlineRunner, params: MIN_PARAMS })
    const unlocked = await unlockVaultKey('Müller-Paßwort-123', USER, bundle, { runner: inlineRunner })
    const blob = await encrypt(vaultKey, utf8Encode('x'), ENTRY)
    expect(utf8Decode(await decrypt(unlocked, blob, ENTRY))).toBe('x')
  })

  it('manipuliertes Salt oder manipulierte (gültige) Parameter -> DecryptionError', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner, params: MIN_PARAMS })
    const variants: VaultKeyBundle[] = [
      copyBundle(bundle, { kdfSalt: flipBit(bundle.kdfSalt, 0) }),
      copyBundle(bundle, { kdfSalt: flipBit(bundle.kdfSalt, 15) }),
      copyBundle(bundle, { kdfParams: { ...bundle.kdfParams, m: bundle.kdfParams.m + 1 } }),
      copyBundle(bundle, { kdfParams: { ...bundle.kdfParams, t: bundle.kdfParams.t + 1 } }),
      copyBundle(bundle, { kdfParams: { ...bundle.kdfParams, p: 2 } }),
    ]
    for (const variant of variants) {
      expect(await rejectsWith(unlockVaultKey(PASSWORD, USER, variant, { runner: inlineRunner }))).toBeInstanceOf(DecryptionError)
    }
  })

  it('benutzte Parameter werden gespeichert (nicht die Standardwerte)', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, { runner: inlineRunner, params: { ...MIN_PARAMS, t: 3 } })
    expect(bundle.kdfParams.t).toBe(3)
    await expect(unlockVaultKey(PASSWORD, USER, bundle, { runner: inlineRunner })).resolves.toBeDefined()
  })
})

describe('Schlüsselverpackung (schnelle Ersatz-KDF)', () => {
  it('zweimal Einrichten ergibt verschiedene Salts, Nonces und verpackte Schlüssel', async () => {
    const a = (await createVaultKey(PASSWORD, USER, fast)).bundle
    const b = (await createVaultKey(PASSWORD, USER, fast)).bundle
    expect(toHex(a.kdfSalt)).not.toBe(toHex(b.kdfSalt))
    expect(toHex(a.nonce)).not.toBe(toHex(b.nonce))
    expect(toHex(a.encryptedVaultKey)).not.toBe(toHex(b.encryptedVaultKey))
  })

  it('zwei Einrichtungen erzeugen verschiedene Vault Keys', async () => {
    const a = await createVaultKey(PASSWORD, USER, fast)
    const b = await createVaultKey(PASSWORD, USER, fast)
    const blob = await encrypt(a.vaultKey, utf8Encode('x'), ENTRY)
    await expect(decrypt(b.vaultKey, blob, ENTRY)).rejects.toBeInstanceOf(DecryptionError)
  })

  it('jede Änderung eines Bytes im verpackten Schlüssel, in Nonce oder Tag wird erkannt', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    for (const field of ['encryptedVaultKey', 'nonce', 'tag'] as const) {
      for (let i = 0; i < bundle[field].length; i++) {
        const tampered = copyBundle(bundle, { [field]: flipBit(bundle[field], i) })
        expect(await rejectsWith(unlockVaultKey(PASSWORD, USER, tampered, fast))).toBeInstanceOf(DecryptionError)
      }
    }
  })

  it('vertauschte Felder zweier Bundles werden erkannt', async () => {
    const a = (await createVaultKey(PASSWORD, USER, fast)).bundle
    const b = (await createVaultKey(PASSWORD, USER, fast)).bundle
    for (const field of ['encryptedVaultKey', 'nonce', 'tag', 'kdfSalt'] as const) {
      const mixed = copyBundle(a, { [field]: new Uint8Array(b[field]) })
      expect(await rejectsWith(unlockVaultKey(PASSWORD, USER, mixed, fast))).toBeInstanceOf(DecryptionError)
    }
  })

  it('das Bundle eines anderen Benutzers lässt sich nicht öffnen (AAD enthält die Benutzer-ID)', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    expect(await rejectsWith(unlockVaultKey(PASSWORD, USER + 1, bundle, fast))).toBeInstanceOf(DecryptionError)
  })

  it('Fehlermeldungen enthalten weder Passwort noch Schlüsselmaterial', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    const error = await rejectsWith(unlockVaultKey('falsch-falsch-falsch', USER, bundle, fast))
    expect(error).toBeInstanceOf(CryptoError)
    for (const secret of ['falsch-falsch', toHex(bundle.encryptedVaultKey), toHex(bundle.nonce), toHex(bundle.tag)]) {
      expect(error!.message).not.toContain(secret)
    }
    expect((error as { cause?: unknown }).cause).toBeUndefined()
  })

  it('keine Konsolenausgaben bei Erfolg und Fehlern', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    await unlockVaultKey(PASSWORD, USER, bundle, fast)
    await unlockVaultKey('falsch-falsch', USER, bundle, fast).catch(() => undefined)
    await unlockVaultKey(PASSWORD, USER, { nope: 1 }, fast).catch(() => undefined)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('Passwort-Bytes werden beim Einrichten und Entsperren überschrieben', async () => {
    const seen: Uint8Array[] = []
    const spy: KdfRunner = async (request) => {
      seen.push(request.password)
      return fakeRunner(request)
    }
    const { bundle } = await createVaultKey(PASSWORD, USER, { runner: spy, params: MIN_PARAMS })
    await unlockVaultKey(PASSWORD, USER, bundle, { runner: spy })
    expect(seen).toHaveLength(2)
    for (const bytes of seen) expect(bytes.every((b) => b === 0)).toBe(true)
  })
})

describe('Prüfung von Parametern und Bundle (ohne zu rechnen)', () => {
  const runner = vi.fn(fakeRunner)

  it('Parameter außerhalb der Grenzen im gespeicherten Bundle (Downgrade/DoS durch den Server) werden abgelehnt', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    runner.mockClear()
    const bad = [
      { ...bundle.kdfParams, m: 8 },
      { ...bundle.kdfParams, m: 4_000_000 },
      { ...bundle.kdfParams, t: 1 },
      { ...bundle.kdfParams, t: 1000 },
      { ...bundle.kdfParams, alg: 'argon2d' },
      { ...bundle.kdfParams, v: 2 },
      { ...bundle.kdfParams, extra: true },
    ]
    for (const kdfParams of bad) {
      const error = await rejectsWith(unlockVaultKey(PASSWORD, USER, { ...bundle, kdfParams }, { runner }))
      expect(error).toBeInstanceOf(CryptoFormatError)
    }
    expect(runner).not.toHaveBeenCalled()
  })

  it('createVaultKey lehnt ungültige Parameter und Benutzer-IDs ab', async () => {
    await expect(createVaultKey(PASSWORD, USER, { runner, params: { ...MIN_PARAMS, m: 1 } })).rejects.toBeInstanceOf(CryptoFormatError)
    for (const id of [0, -1, 1.5, NaN, 2 ** 32, '1' as unknown as number]) {
      await expect(createVaultKey(PASSWORD, id, { runner, params: MIN_PARAMS })).rejects.toBeInstanceOf(CryptoFormatError)
    }
    expect(runner).not.toHaveBeenCalled()
  })

  it('validateBundle prüft Typen und Längen', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    expect(validateBundle(bundle)).toEqual(bundle)
    const bad: unknown[] = [
      null,
      undefined,
      'text',
      {},
      { ...bundle, kdfSalt: sequence(15) },
      { ...bundle, kdfSalt: sequence(33) },
      { ...bundle, encryptedVaultKey: sequence(31) },
      { ...bundle, encryptedVaultKey: sequence(33) },
      { ...bundle, nonce: sequence(11) },
      { ...bundle, nonce: sequence(13) },
      { ...bundle, tag: sequence(15) },
      { ...bundle, tag: sequence(17) },
      { ...bundle, tag: 'abcd' },
      { ...bundle, kdfParams: undefined },
      { ...bundle, kdfParams: JSON.stringify(bundle.kdfParams) },
    ]
    for (const input of bad) expect(() => validateBundle(input)).toThrow(CryptoFormatError)
    expect(WRAPPED_KEY_BYTES).toBe(32)
  })

  it('validateBundle liefert Kopien', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    const copy = validateBundle(bundle)
    bundle.encryptedVaultKey.fill(0)
    expect(copy.encryptedVaultKey.some((b) => b !== 0)).toBe(true)
  })

  it('leeres oder ungültiges Masterpasswort wird abgelehnt', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    await expect(unlockVaultKey('', USER, bundle, fast)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(createVaultKey('', USER, fast)).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(createVaultKey('abc\uD800', USER, fast)).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('Kompatibilität mit dem späteren Ändern des Masterpassworts', () => {
  it('nur mit extractable: true lässt sich der Vault Key mit einem neuen KEK neu verpacken', async () => {
    const { bundle, vaultKey } = await createVaultKey(PASSWORD, USER, fast)

    // Normalbetrieb: nicht exportierbar, also auch nicht neu verpackbar
    const sealed = await unlockVaultKey(PASSWORD, USER, bundle, fast)
    const newKek = await deriveKek('Neues-Masterpasswort-123', sequence(16, 99), MIN_PARAMS, { runner: fakeRunner })
    const iv = new Uint8Array(12)
    await expect(crypto.subtle.wrapKey('raw', sealed, newKek, { name: 'AES-GCM', iv })).rejects.toBeDefined()

    // Änderungsablauf: kurz extrahierbar entpacken, neu verpacken, wieder entpacken
    const temporary = await unlockVaultKey(PASSWORD, USER, bundle, { ...fast, extractable: true })
    expect(temporary.extractable).toBe(true)
    const rewrapped = await crypto.subtle.wrapKey('raw', temporary, newKek, { name: 'AES-GCM', iv })
    const restored = await crypto.subtle.unwrapKey('raw', rewrapped, newKek, { name: 'AES-GCM', iv }, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

    const blob = await encrypt(vaultKey, utf8Encode('bleibt lesbar'), ENTRY)
    expect(utf8Decode(await decrypt(restored, blob, ENTRY))).toBe('bleibt lesbar')
  })

  it('der Standard ist nicht extrahierbar', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    expect((await unlockVaultKey(PASSWORD, USER, bundle, fast)).extractable).toBe(false)
  })

  it('entpackter Schlüssel ist ein vollwertiger Schlüssel für encrypt/decrypt des Kerns', async () => {
    const { bundle } = await createVaultKey(PASSWORD, USER, fast)
    const key = await unlockVaultKey(PASSWORD, USER, bundle, fast)
    const other = await generateAesKey()
    const blob = await encrypt(key, utf8Encode('x'), ENTRY)
    await expect(decrypt(other, blob, ENTRY)).rejects.toBeInstanceOf(DecryptionError)
    expect(utf8Decode(await decrypt(key, blob, ENTRY))).toBe('x')
  })
})
