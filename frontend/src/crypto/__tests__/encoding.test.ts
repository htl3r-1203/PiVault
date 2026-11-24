import { describe, expect, it } from 'vitest'
import { CryptoFormatError } from '../errors'
import { base64urlDecode, base64urlEncode, utf8Decode, utf8Encode, zeroize } from '../encoding'
import { sequence } from './helpers'

describe('base64url', () => {
  // RFC 4648, Abschnitt 10 (ohne Padding, Standard-Alphabet bei diesen Beispielen identisch)
  const rfcVectors: [string, string][] = [
    ['', ''],
    ['f', 'Zg'],
    ['fo', 'Zm8'],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'],
    ['fooba', 'Zm9vYmE'],
    ['foobar', 'Zm9vYmFy'],
  ]

  it.each(rfcVectors)('kodiert und dekodiert die RFC-4648-Vektoren (%j)', (text, encoded) => {
    const bytes = new TextEncoder().encode(text)
    expect(base64urlEncode(bytes)).toBe(encoded)
    expect(Array.from(base64urlDecode(encoded))).toEqual(Array.from(bytes))
  })

  it('verwendet das URL-sichere Alphabet ohne Padding', () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xfe])
    expect(base64urlEncode(bytes)).toBe('-__-')
    expect(base64urlEncode(Uint8Array.from([0xfb]))).toBe('-w')
  })

  it('Roundtrip für alle Längen 0..300 und alle Byte-Werte', () => {
    for (let length = 0; length <= 300; length++) {
      const bytes = sequence(length, length * 7)
      expect(Array.from(base64urlDecode(base64urlEncode(bytes)))).toEqual(Array.from(bytes))
    }
    const all = sequence(256)
    expect(Array.from(base64urlDecode(base64urlEncode(all)))).toEqual(Array.from(all))
  })

  it.each([
    ['Padding', 'Zg=='],
    ['Standard-Alphabet "+"', 'a+bc'],
    ['Standard-Alphabet "/"', 'a/bc'],
    ['Leerzeichen', 'Zm9v '],
    ['Zeilenumbruch', 'Zm9v\n'],
    ['Nicht-ASCII', 'Zm9é'],
    ['Länge 4n+1', 'Zm9vY'],
    ['gesetzte Restbits (1 Byte)', 'Zh'],
    ['gesetzte Restbits (2 Byte)', 'Zm9'],
  ])('lehnt ungültige Eingabe ab: %s', (_name, input) => {
    expect(() => base64urlDecode(input)).toThrow(CryptoFormatError)
  })

  it('lehnt Nicht-Texte und Nicht-Bytes ab', () => {
    expect(() => base64urlDecode(42 as unknown as string)).toThrow(CryptoFormatError)
    expect(() => base64urlEncode([1, 2, 3] as unknown as Uint8Array)).toThrow(CryptoFormatError)
    expect(() => base64urlEncode('abc' as unknown as Uint8Array)).toThrow(CryptoFormatError)
  })

  it('begrenzt die Größe der dekodierten Daten', () => {
    expect(() => base64urlDecode('A'.repeat(100), 10)).toThrow(CryptoFormatError)
    expect(base64urlDecode('Zm9v', 3)).toHaveLength(3)
    expect(() => base64urlDecode('Zm9v', -1)).toThrow(CryptoFormatError)
  })

  it('akzeptiert pro Bytefolge genau eine Schreibweise', () => {
    // "Zh" und "Zg" würden beide mit lockerem Dekoder zu 0x66 dekodieren
    expect(() => base64urlDecode('Zh')).toThrow(CryptoFormatError)
    expect(base64urlDecode('Zg')[0]).toBe(0x66)
  })
})

describe('UTF-8', () => {
  it('Roundtrip mit Umlauten, Emoji und BOM', () => {
    for (const text of ['', 'abc', 'Größe ÄÖÜ ß', '密码 🔐', '﻿mit BOM']) {
      expect(utf8Decode(utf8Encode(text))).toBe(text)
    }
  })

  it('lehnt einzelne Surrogate ab statt sie zu ersetzen', () => {
    expect(() => utf8Encode('a\uD800b')).toThrow(CryptoFormatError)
    expect(() => utf8Encode('\uDC00')).toThrow(CryptoFormatError)
    expect(utf8Encode('🔐')).toHaveLength(4)
  })

  it('lehnt ungültiges UTF-8 ab', () => {
    expect(() => utf8Decode(Uint8Array.from([0xff, 0xfe]))).toThrow(CryptoFormatError)
    expect(() => utf8Decode(Uint8Array.from([0xc3]))).toThrow(CryptoFormatError)
  })
})

describe('zeroize', () => {
  it('überschreibt die Bytes mit Nullen', () => {
    const bytes = sequence(16, 1)
    zeroize(bytes)
    expect(Array.from(bytes)).toEqual(new Array(16).fill(0))
  })
})
