import { describe, expect, it } from 'vitest'
import { CryptoFormatError } from '../errors'
import {
  DEFAULT_KDF_PARAMS,
  KDF_LIMITS,
  MAX_PASSWORD_BYTES,
  normalizePassword,
  validateKdfParams,
  validateSalt,
} from '../kdfParams'
import { sequence, toHex } from './helpers'

const base = { v: 1, alg: 'argon2id', m: 32_768, t: 3, p: 1, len: 32 }

describe('validateKdfParams', () => {
  it('akzeptiert die Standardparameter und liefert eine Kopie', () => {
    const result = validateKdfParams({ ...base })
    expect(result).toEqual(DEFAULT_KDF_PARAMS)
    expect(result).not.toBe(base)
  })

  it('akzeptiert alle Grenzwerte (Minimum und Maximum)', () => {
    expect(validateKdfParams({ ...base, m: KDF_LIMITS.m.min, t: KDF_LIMITS.t.min, p: KDF_LIMITS.p.min }).m).toBe(19_456)
    expect(validateKdfParams({ ...base, m: KDF_LIMITS.m.max, t: KDF_LIMITS.t.max, p: KDF_LIMITS.p.max }).m).toBe(262_144)
  })

  it('der Standard liegt innerhalb der Grenzen und über dem OWASP-Minimum', () => {
    expect(DEFAULT_KDF_PARAMS.m).toBeGreaterThanOrEqual(19_456)
    expect(DEFAULT_KDF_PARAMS.t).toBeGreaterThanOrEqual(2)
    expect(() => validateKdfParams(DEFAULT_KDF_PARAMS)).not.toThrow()
  })

  it.each([
    ['m unter Minimum (Downgrade)', { m: 19_455 }],
    ['m = 8 (viel zu schwach)', { m: 8 }],
    ['m über Maximum (Speicher-DoS)', { m: 262_145 }],
    ['m riesig', { m: 2 ** 31 }],
    ['t = 1', { t: 1 }],
    ['t über Maximum', { t: 7 }],
    ['t = 0', { t: 0 }],
    ['p = 0', { p: 0 }],
    ['p über Maximum', { p: 5 }],
    ['len 16', { len: 16 }],
    ['len 64', { len: 64 }],
    ['v = 2', { v: 2 }],
    ['v = 0', { v: 0 }],
    ['alg argon2i', { alg: 'argon2i' }],
    ['alg argon2d', { alg: 'argon2d' }],
    ['alg großgeschrieben', { alg: 'Argon2id' }],
    ['m als Text', { m: '32768' }],
    ['t als Text', { t: '3' }],
    ['v als Text', { v: '1' }],
    ['m Dezimalzahl', { m: 32_768.5 }],
    ['m NaN', { m: NaN }],
    ['m Infinity', { m: Infinity }],
    ['m negativ', { m: -32_768 }],
    ['m null', { m: null }],
  ])('lehnt ab: %s', (_name, change) => {
    expect(() => validateKdfParams({ ...base, ...change })).toThrow(CryptoFormatError)
  })

  it('lehnt zusätzliche und fehlende Felder ab', () => {
    expect(() => validateKdfParams({ ...base, extra: 1 })).toThrow(CryptoFormatError)
    expect(() => validateKdfParams({ ...base, secret: 'x' })).toThrow(CryptoFormatError)
    for (const key of Object.keys(base)) {
      const copy: Record<string, unknown> = { ...base }
      delete copy[key]
      expect(() => validateKdfParams(copy)).toThrow(CryptoFormatError)
    }
  })

  it.each([null, undefined, 'argon2id', 42, [], [1, 2, 3], true])('lehnt Nicht-Objekt %j ab', (value) => {
    expect(() => validateKdfParams(value)).toThrow(CryptoFormatError)
  })

  it('liefert eine Kopie, die nur die bekannten Felder enthält', () => {
    const input = { ...base }
    const result = validateKdfParams(input)
    input.m = 99_999
    expect(result.m).toBe(32_768)
    expect(Object.keys(result).sort()).toEqual(['alg', 'len', 'm', 'p', 't', 'v'])
  })
})

describe('validateSalt', () => {
  it.each([16, 24, 32])('akzeptiert %i Byte', (length) => {
    expect(() => validateSalt(sequence(length))).not.toThrow()
  })

  it.each([0, 1, 15, 33, 64])('lehnt %i Byte ab', (length) => {
    expect(() => validateSalt(new Uint8Array(length))).toThrow(CryptoFormatError)
  })

  it('lehnt Nicht-Bytes ab', () => {
    expect(() => validateSalt('0123456789abcdef')).toThrow(CryptoFormatError)
    expect(() => validateSalt(null)).toThrow(CryptoFormatError)
  })
})

describe('normalizePassword (NFKC, UTF-8)', () => {
  it('zusammengesetzte und zerlegte Umlaute ergeben dieselben Bytes', () => {
    const composed = 'Müller-Paßwort' // ü einteilig
    const decomposed = 'Müller-Paßwort' // u + kombinierender Umlautpunkt
    expect(composed).not.toBe(decomposed)
    expect(toHex(normalizePassword(composed))).toBe(toHex(normalizePassword(decomposed)))
  })

  it('Kompatibilitätszeichen werden gleichgesetzt (NFKC)', () => {
    expect(toHex(normalizePassword('ﬁ'))).toBe(toHex(normalizePassword('fi'))) // Ligatur ﬁ
    expect(toHex(normalizePassword('ＡＢ'))).toBe(toHex(normalizePassword('AB'))) // Vollbreite
    expect(toHex(normalizePassword('x²'))).toBe(toHex(normalizePassword('x2')))
  })

  it('verschiedene Passwörter bleiben verschieden (Groß-/Kleinschreibung, Leerzeichen)', () => {
    expect(toHex(normalizePassword('Passwort'))).not.toBe(toHex(normalizePassword('passwort')))
    expect(toHex(normalizePassword('a b'))).not.toBe(toHex(normalizePassword('ab')))
    expect(toHex(normalizePassword(' a'))).not.toBe(toHex(normalizePassword('a')))
  })

  it('lässt Emoji, CJK, Steuerzeichen und NUL zu', () => {
    for (const password of ['🔐🔑', '密码', 'a\tb', 'a\u0000b', 'emoji 👨‍👩‍👧‍👦']) {
      expect(normalizePassword(password).length).toBeGreaterThan(0)
    }
  })

  it('lehnt leere Passwörter ab', () => {
    expect(() => normalizePassword('')).toThrow(CryptoFormatError)
  })

  it('lehnt einzelne Surrogate ab statt sie zu ersetzen', () => {
    expect(() => normalizePassword('abc\uD800')).toThrow(CryptoFormatError)
    expect(() => normalizePassword('\uDC00abc')).toThrow(CryptoFormatError)
  })

  it('lehnt Nicht-Texte ab', () => {
    expect(() => normalizePassword(123 as unknown as string)).toThrow(CryptoFormatError)
    expect(() => normalizePassword(null as unknown as string)).toThrow(CryptoFormatError)
  })

  it('begrenzt die Länge (nach der Normalisierung, in UTF-8-Bytes)', () => {
    expect(normalizePassword('a'.repeat(MAX_PASSWORD_BYTES))).toHaveLength(MAX_PASSWORD_BYTES)
    expect(() => normalizePassword('a'.repeat(MAX_PASSWORD_BYTES + 1))).toThrow(CryptoFormatError)
    // 2.000 Zeichen à 3 Byte = 6.000 Byte > Grenze
    expect(() => normalizePassword('密'.repeat(2000))).toThrow(CryptoFormatError)
  })

  it('liefert bei jedem Aufruf neue Bytes (gehören dem Aufrufer)', () => {
    const a = normalizePassword('geheim')
    a.fill(0)
    expect(normalizePassword('geheim').some((b) => b !== 0)).toBe(true)
  })
})
