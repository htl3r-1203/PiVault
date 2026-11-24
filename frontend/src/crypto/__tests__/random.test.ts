import { afterEach, describe, expect, it, vi } from 'vitest'
import { CryptoFormatError, CryptoUnavailableError } from '../errors'
import { MAX_RANDOM_BYTES, NONCE_BYTES, generateNonce, randomBytes } from '../random'
import { toHex } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('randomBytes', () => {
  it('liefert die gewünschte Länge', () => {
    for (const length of [1, 12, 16, 32, 1000, MAX_RANDOM_BYTES]) {
      expect(randomBytes(length)).toHaveLength(length)
    }
  })

  it('lehnt ungültige Längen ab', () => {
    for (const length of [0, -1, 1.5, NaN, Infinity, MAX_RANDOM_BYTES + 1, '12' as unknown as number]) {
      expect(() => randomBytes(length)).toThrow(CryptoFormatError)
    }
  })

  it('liefert bei jedem Aufruf andere Werte', () => {
    expect(toHex(randomBytes(32))).not.toBe(toHex(randomBytes(32)))
  })

  it('verwendet crypto.getRandomValues (nicht Math.random)', () => {
    const math = vi.spyOn(Math, 'random')
    const source = vi.spyOn(globalThis.crypto, 'getRandomValues')
    randomBytes(16)
    expect(source).toHaveBeenCalledTimes(1)
    expect(math).not.toHaveBeenCalled()
  })

  it('wirft einen klaren Fehler, wenn kein Zufallsgenerator existiert', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => randomBytes(8)).toThrow(CryptoUnavailableError)
  })

  it('der Zufallsdaten-Puffer wird nicht zwischen Aufrufen geteilt', () => {
    const a = randomBytes(16)
    const snapshot = toHex(a)
    randomBytes(16)
    expect(toHex(a)).toBe(snapshot)
  })
})

describe('generateNonce', () => {
  it('ist 96 Bit (12 Byte) lang', () => {
    expect(NONCE_BYTES).toBe(12)
    expect(generateNonce()).toHaveLength(12)
  })

  it('erzeugt in 10.000 Aufrufen keine Wiederholung', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i++) seen.add(toHex(generateNonce()))
    expect(seen.size).toBe(10_000)
  })

  it('ist nicht konstant und nicht nur Nullen', () => {
    const nonce = generateNonce()
    expect(nonce.some((b) => b !== 0)).toBe(true)
  })

  it('verteilt die Bits grob gleichmäßig (Plausibilitätstest, kein Qualitätsnachweis des CSPRNG)', () => {
    // 2.000 Nonces = 192.000 Bit; erwartet ~96.000 gesetzte Bits, Standardabweichung ~219. Grenze: ±2.000 (> 9 Sigma)
    let ones = 0
    for (let i = 0; i < 2_000; i++) {
      for (const byte of generateNonce()) {
        for (let bit = 0; bit < 8; bit++) ones += (byte >> bit) & 1
      }
    }
    expect(Math.abs(ones - 96_000)).toBeLessThan(2_000)
  })
})
