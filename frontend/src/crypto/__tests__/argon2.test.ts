// Argon2id-Tests mit bekannten Antworten.
//
// A) RFC 9106, Abschnitt 5.3 (offizieller Testvektor, mit Secret und Associated Data): prüft die
//    Bibliothek @noble/hashes direkt.
// B) Referenzwerte, die unabhängig mit OpenSSL 3.5 (`openssl kdf ARGON2ID`) berechnet wurden, laufen durch
//    PiVaults Ableitung (Normalisierung, Parameterzuordnung, Salt). Der KEK ist nicht auslesbar; verglichen
//    wird deshalb über einen Fingerabdruck (siehe helpers.ts).
//
// Zusätzlich: Reproduzierbarkeit, Salt-/Passwort-/Parameterabhängigkeit, Normalisierung und die
// Eigenschaften des KEK (nicht extrahierbar, nur wrapKey/unwrapKey).

import { argon2id } from '@noble/hashes/argon2.js'
import { describe, expect, it, vi } from 'vitest'
import { encrypt } from '../aesGcm'
import { CryptoFormatError, KdfError } from '../errors'
import { benchmarkKdf, deriveKek, generateSalt, inlineRunner, type KdfRunner } from '../kdf'
import { handleKdfRequest } from '../kdfCore'
import { fingerprint, hex, kekFromRaw, MIN_PARAMS, sequence, toHex } from './helpers'

const SALT = sequence(16, 0x10) // 10 11 12 … 1f

describe('A) RFC 9106 §5.3 (Argon2id, Version 0x13)', () => {
  it('liefert den offiziellen Tag', () => {
    const tag = argon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      t: 3,
      m: 32,
      p: 4,
      dkLen: 32,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
    })
    expect(toHex(tag)).toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659')
  })
})

describe('B) Referenzwerte (OpenSSL) durch PiVaults Ableitung', () => {
  const cases = [
    { name: 'Standard (64 MiB, t=3, p=1)', pw: 'correct horse battery staple', m: 65_536, t: 3, p: 1, key: '1a563099620be88a73c7bd53da0b313e98060493b58ba22254a065c3d7db26c3' },
    { name: 'Minimum (19 MiB, t=2, p=1)', pw: 'correct horse battery staple', m: 19_456, t: 2, p: 1, key: '2a45fe290a3d07e80c1c9e1017ec44fc4f3c6456ceb21455c733900278f1c374' },
    { name: 'Parallelität p=4', pw: 'correct horse battery staple', m: 32_768, t: 2, p: 4, key: '6a46ee4436c6813451abb3ae4df4e8b739dcba56dd9315f3d5890175c6c0534a' },
    { name: 'Unicode (Umlaut, CJK, Emoji)', pw: 'Pässwörd-密码-🔐', m: 19_456, t: 2, p: 1, key: '6e7ca10081f56b6b4f925f488957317bf02ced65b98767cb73cf5c426ae6018b' },
    { name: 'Kompatibilitätszeichen (NFKC-normalisiert)', pw: 'Ａｂｃ ﬁ ²', m: 19_456, t: 2, p: 1, key: 'a25fa5bb1e60cf12aa548aff84d778a41e4b3009a55b7a381eff151bdc99aaab' },
    { name: 'kurzes Passwort', pw: 'x', m: 19_456, t: 2, p: 1, key: '79e866f463b1519a624f47fa8377510e88bbf8d174ee0f9b0b1e5690a08dac7e' },
  ]

  it.each(cases)('$name', async ({ pw, m, t, p, key }) => {
    const kek = await deriveKek(pw, SALT, { ...MIN_PARAMS, m, t, p }, { runner: inlineRunner })
    expect(await fingerprint(kek)).toBe(await fingerprint(await kekFromRaw(hex(key))))
  })

  it('der Vergleich über den Fingerabdruck erkennt Abweichungen', async () => {
    const wrong = await deriveKek('anderes Passwort', SALT, MIN_PARAMS, { runner: inlineRunner })
    expect(await fingerprint(wrong)).not.toBe(await fingerprint(await kekFromRaw(hex(cases[1]!.key))))
  })
})

describe('Ableitung: Reproduzierbarkeit und Abhängigkeiten', () => {
  const derive = (password: string, salt = SALT, params: unknown = MIN_PARAMS) =>
    deriveKek(password, salt, params, { runner: inlineRunner }).then(fingerprint)

  it('gleiche Eingaben ergeben denselben Schlüssel', async () => {
    expect(await derive('geheimes Passwort')).toBe(await derive('geheimes Passwort'))
  })

  it('unterschiedliche Salts ergeben unterschiedliche Schlüssel (schon 1 Bit)', async () => {
    const other = new Uint8Array(SALT)
    other[15] = other[15]! ^ 1
    expect(await derive('geheimes Passwort', other)).not.toBe(await derive('geheimes Passwort'))
  })

  it('ein anderes Passwort ergibt einen anderen Schlüssel (schon 1 Zeichen)', async () => {
    expect(await derive('geheimes Passwort!')).not.toBe(await derive('geheimes Passwort'))
  })

  it.each([
    ['m', { m: 19_457 }],
    ['t', { t: 3 }],
    ['p', { p: 2 }],
  ])('ein anderer Parameter %s ergibt einen anderen Schlüssel', async (_name, change) => {
    expect(await derive('geheimes Passwort', SALT, { ...MIN_PARAMS, ...change })).not.toBe(await derive('geheimes Passwort'))
  })

  it('Salt mit 24 und 32 Byte ist erlaubt und ergibt andere Schlüssel als 16 Byte', async () => {
    const a = await derive('pw-pw-pw', sequence(16))
    expect(await derive('pw-pw-pw', sequence(24))).not.toBe(a)
    expect(await derive('pw-pw-pw', sequence(32))).not.toBe(a)
  })

  it('zusammengesetzte und zerlegte Umlaute ergeben denselben Schlüssel (Normalisierung)', async () => {
    expect(await derive('Müller')).toBe(await derive('Müller'))
  })

  it('Groß-/Kleinschreibung und Leerzeichen zählen', async () => {
    const base = await derive('Passwort')
    expect(await derive('passwort')).not.toBe(base)
    expect(await derive('Passwort ')).not.toBe(base)
  })

  it('generateSalt liefert 16 zufällige, verschiedene Bytes', () => {
    const a = generateSalt()
    expect(a).toHaveLength(16)
    expect(toHex(a)).not.toBe(toHex(generateSalt()))
  })
})

describe('Eigenschaften des KEK', () => {
  it('ist ein nicht extrahierbarer AES-256-Schlüssel nur für wrapKey/unwrapKey', async () => {
    const kek = await deriveKek('pw-für-kek', SALT, MIN_PARAMS, { runner: inlineRunner })
    expect(kek.extractable).toBe(false)
    expect(kek.type).toBe('secret')
    expect((kek.algorithm as AesKeyAlgorithm).name).toBe('AES-GCM')
    expect((kek.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect([...kek.usages].sort()).toEqual(['unwrapKey', 'wrapKey'])
    await expect(crypto.subtle.exportKey('raw', kek)).rejects.toBeDefined()
  })

  it('kann keine Daten verschlüsseln (geringste Berechtigung)', async () => {
    const kek = await deriveKek('pw-für-kek', SALT, MIN_PARAMS, { runner: inlineRunner })
    await expect(encrypt(kek, new Uint8Array(4), { purpose: 'vault-key', userId: 1 })).rejects.toBeInstanceOf(CryptoFormatError)
  })
})

describe('Eingabeprüfung vor der Berechnung', () => {
  const never: KdfRunner = vi.fn(async () => {
    throw new Error('darf nicht aufgerufen werden')
  })

  it.each([
    ['m zu klein', { ...MIN_PARAMS, m: 1024 }],
    ['m zu groß', { ...MIN_PARAMS, m: 1_000_000 }],
    ['t zu klein', { ...MIN_PARAMS, t: 1 }],
    ['falscher Algorithmus', { ...MIN_PARAMS, alg: 'argon2d' }],
    ['unbekannte Version', { ...MIN_PARAMS, v: 9 }],
    ['zusätzliches Feld', { ...MIN_PARAMS, x: 1 }],
    ['keine Parameter', undefined],
  ])('lehnt %s ab, ohne zu rechnen', async (_name, params) => {
    await expect(deriveKek('pw-pw-pw', SALT, params, { runner: never })).rejects.toBeInstanceOf(CryptoFormatError)
    expect(never).not.toHaveBeenCalled()
  })

  it('lehnt falsche Salts und Passwörter ab, ohne zu rechnen', async () => {
    await expect(deriveKek('pw-pw-pw', sequence(15), MIN_PARAMS, { runner: never })).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(deriveKek('', SALT, MIN_PARAMS, { runner: never })).rejects.toBeInstanceOf(CryptoFormatError)
    await expect(deriveKek('abc\uD800', SALT, MIN_PARAMS, { runner: never })).rejects.toBeInstanceOf(CryptoFormatError)
    expect(never).not.toHaveBeenCalled()
  })
})

describe('Bereinigung und Fehlerverhalten', () => {
  it('deriveKek überschreibt die Passwort-Bytes nach der Ableitung', async () => {
    let seen: Uint8Array | undefined
    const spy: KdfRunner = async (request) => {
      seen = request.password
      expect(request.password.some((b) => b !== 0)).toBe(true) // während der Ableitung vorhanden
      return inlineRunner(request)
    }
    await deriveKek('SEHR-geheim-123', SALT, MIN_PARAMS, { runner: spy })
    expect(seen).toBeDefined()
    expect(seen!.every((b) => b === 0)).toBe(true)
  })

  it('deriveKek überschreibt die Passwort-Bytes auch bei einem Fehler', async () => {
    let seen: Uint8Array | undefined
    const failing: KdfRunner = async (request) => {
      seen = request.password
      throw new KdfError()
    }
    await expect(deriveKek('SEHR-geheim-123', SALT, MIN_PARAMS, { runner: failing })).rejects.toBeInstanceOf(KdfError)
    expect(seen!.every((b) => b === 0)).toBe(true)
  })

  it('der Kern überschreibt den übergebenen Passwortpuffer (Erfolg und Fehler)', async () => {
    const ok = new Uint8Array(sequence(12, 1)).buffer as ArrayBuffer
    const okResponse = await handleKdfRequest({ password: ok, salt: new Uint8Array(SALT).buffer, params: MIN_PARAMS })
    expect(okResponse.ok).toBe(true)
    expect(new Uint8Array(ok).every((b) => b === 0)).toBe(true)

    const bad = new Uint8Array(sequence(12, 1)).buffer as ArrayBuffer
    const badResponse = await handleKdfRequest({ password: bad, salt: new Uint8Array(3).buffer, params: MIN_PARAMS })
    expect(badResponse).toEqual({ ok: false, code: 'invalid-input' })
    expect(new Uint8Array(bad).every((b) => b === 0)).toBe(true)
  })

  it('handleKdfRequest wirft nie, sondern liefert Fehlercodes ohne Text', async () => {
    const salt = new Uint8Array(SALT).buffer
    const pw = () => new Uint8Array([1, 2, 3]).buffer as ArrayBuffer
    expect(await handleKdfRequest(null)).toEqual({ ok: false, code: 'invalid-input' })
    expect(await handleKdfRequest('x')).toEqual({ ok: false, code: 'invalid-input' })
    expect(await handleKdfRequest({ password: 'text', salt, params: MIN_PARAMS })).toEqual({ ok: false, code: 'invalid-input' })
    expect(await handleKdfRequest({ password: pw(), salt, params: { ...MIN_PARAMS, m: 1 } })).toEqual({ ok: false, code: 'invalid-input' })
    expect(await handleKdfRequest({ password: new ArrayBuffer(0), salt, params: MIN_PARAMS })).toEqual({ ok: false, code: 'invalid-input' })
  })

  it('der Worker-Kern prüft Parameter erneut (nicht nur der Hauptthread)', async () => {
    const response = await handleKdfRequest({ password: new Uint8Array([1]).buffer, salt: new Uint8Array(SALT).buffer, params: { ...MIN_PARAMS, m: 8 } })
    expect(response).toEqual({ ok: false, code: 'invalid-input' })
  })

  it('benchmarkKdf liefert eine positive Dauer in Millisekunden', async () => {
    const ms = await benchmarkKdf(MIN_PARAMS, { runner: inlineRunner })
    expect(ms).toBeGreaterThan(0)
  })
})

// Aufwendiger Zeitvergleich für echte Geräte: KDF_BENCH=1 npm test -- argon2
const BENCH = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.KDF_BENCH
describe.skipIf(!BENCH)('Zeitmessung (nur mit KDF_BENCH=1)', () => {
  it('misst typische Parameter', async () => {
    const lines: string[] = []
    for (const [m, t] of [[19_456, 2], [32_768, 3], [65_536, 3], [131_072, 3]] as const) {
      const ms = await benchmarkKdf({ ...MIN_PARAMS, m, t }, { runner: inlineRunner })
      lines.push(`m=${m / 1024} MiB t=${t}: ${ms.toFixed(0)} ms`)
    }
    console.info(lines.join('\n'))
  })
})
