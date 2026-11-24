import { describe, expect, it } from 'vitest'
import { CryptoFormatError } from '../errors'
import {
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
  type EncryptedBlob,
  type EncryptionContext,
} from '../format'
import { sequence, toHex } from './helpers'

const blob = (overrides: Partial<EncryptedBlob> = {}): EncryptedBlob => ({
  version: 1,
  nonce: sequence(NONCE_BYTES, 1),
  ciphertext: sequence(40, 50),
  tag: sequence(TAG_BYTES, 100),
  ...overrides,
})

describe('Formatkonstanten', () => {
  it('entsprechen dem Datenbankschema', () => {
    expect(NONCE_BYTES).toBe(12)
    expect(TAG_BYTES).toBe(16)
    expect(CURRENT_FORMAT_VERSION).toBe(1)
    expect(SUPPORTED_FORMAT_VERSIONS).toEqual([1])
    expect(AAD_BYTES).toBe(18)
  })
})

describe('buildAad (kanonisches AAD v1)', () => {
  it('Eintrag: Magic, Version, Zweck und IDs als feste Big-Endian-Felder', () => {
    const aad = buildAad(1, { purpose: 'entry', userId: 1, vaultId: 2, entryId: 3 })
    expect(toHex(aad)).toBe('50564c540104000000010000000200000003')
  })

  it('Tresorschlüssel: Tresor- und Eintrags-ID sind 0', () => {
    expect(toHex(buildAad(1, { purpose: 'vault-key', userId: 7 }))).toBe('50564c540101000000070000000000000000')
  })

  it('Tresorname und -beschreibung haben eigene Zweck-Codes', () => {
    expect(toHex(buildAad(1, { purpose: 'vault-name', userId: 1, vaultId: 2 }))).toBe('50564c540102000000010000000200000000')
    expect(toHex(buildAad(1, { purpose: 'vault-description', userId: 1, vaultId: 2 }))).toBe(
      '50564c540103000000010000000200000000',
    )
  })

  it('kodiert große IDs bis 2^32-1 vorzeichenlos', () => {
    const aad = buildAad(1, { purpose: 'entry', userId: 0xffffffff, vaultId: 0x80000000, entryId: 0x01020304 })
    expect(toHex(aad.slice(6))).toBe('ffffffff8000000001020304')
  })

  it('ist deterministisch und unterscheidet jede Komponente', () => {
    const base: EncryptionContext = { purpose: 'entry', userId: 1, vaultId: 2, entryId: 3 }
    const variants: EncryptionContext[] = [
      { ...base, userId: 9 },
      { ...base, vaultId: 9 },
      { ...base, entryId: 9 },
      { purpose: 'vault-name', userId: 1, vaultId: 2 },
    ]
    const reference = toHex(buildAad(1, base))
    expect(toHex(buildAad(1, { ...base }))).toBe(reference)
    for (const variant of variants) expect(toHex(buildAad(1, variant))).not.toBe(reference)
  })

  it.each([
    ['unbekannter Zweck', { purpose: 'foo', userId: 1 }],
    ['Zweck über Prototypkette', { purpose: 'constructor', userId: 1 }],
    ['Zweck fehlt', { userId: 1 }],
    ['userId fehlt', { purpose: 'vault-key' }],
    ['userId 0', { purpose: 'vault-key', userId: 0 }],
    ['userId negativ', { purpose: 'vault-key', userId: -1 }],
    ['userId Dezimalzahl', { purpose: 'vault-key', userId: 1.5 }],
    ['userId zu groß', { purpose: 'vault-key', userId: 2 ** 32 }],
    ['userId als Text', { purpose: 'vault-key', userId: '1' }],
    ['userId NaN', { purpose: 'vault-key', userId: NaN }],
    ['vaultId fehlt bei vault-name', { purpose: 'vault-name', userId: 1 }],
    ['entryId fehlt bei entry', { purpose: 'entry', userId: 1, vaultId: 1 }],
    ['überzählige vaultId bei vault-key', { purpose: 'vault-key', userId: 1, vaultId: 1 }],
    ['überzählige entryId bei vault-name', { purpose: 'vault-name', userId: 1, vaultId: 1, entryId: 1 }],
  ])('lehnt ungültigen Kontext ab: %s', (_name, context) => {
    expect(() => buildAad(1, context as unknown as EncryptionContext)).toThrow(CryptoFormatError)
  })

  it('lehnt fehlenden Kontext ab', () => {
    expect(() => buildAad(1, null as unknown as EncryptionContext)).toThrow(CryptoFormatError)
    expect(() => buildAad(1, undefined as unknown as EncryptionContext)).toThrow(CryptoFormatError)
  })

  it.each([0, 2, 255, -1, 1.5, NaN, '1', null, undefined])('lehnt Formatversion %j ab', (version) => {
    expect(() => buildAad(version as number, { purpose: 'vault-key', userId: 1 })).toThrow(CryptoFormatError)
  })
})

describe('Blockformat', () => {
  it('Serialisierung: Version || Nonce || Chiffretext || Tag', () => {
    const bytes = serializeBlob(blob())
    expect(bytes).toHaveLength(1 + 12 + 40 + 16)
    expect(bytes[0]).toBe(1)
    expect(Array.from(bytes.slice(1, 13))).toEqual(Array.from(sequence(12, 1)))
    expect(Array.from(bytes.slice(13, 53))).toEqual(Array.from(sequence(40, 50)))
    expect(Array.from(bytes.slice(53))).toEqual(Array.from(sequence(16, 100)))
  })

  it('Roundtrip als Bytes und als Base64url-Text', () => {
    const original = blob()
    expect(parseBlob(serializeBlob(original))).toEqual(original)
    expect(decodeBlob(encodeBlob(original))).toEqual(original)
  })

  it('parseBlob liefert Kopien (kein Aliasing mit der Eingabe)', () => {
    const bytes = serializeBlob(blob())
    const parsed = parseBlob(bytes)
    bytes.fill(0)
    expect(parsed.ciphertext.some((b) => b !== 0)).toBe(true)
  })

  it('lehnt nicht unterstützte Versionen ab (auch beim Lesen)', () => {
    const bytes = serializeBlob(blob())
    for (const version of [0, 2, 3, 255]) {
      const copy = new Uint8Array(bytes)
      copy[0] = version
      expect(() => parseBlob(copy)).toThrow(CryptoFormatError)
    }
    expect(() => serializeBlob(blob({ version: 2 }))).toThrow(CryptoFormatError)
  })

  it('lehnt zu kurze und zu lange Blöcke ab', () => {
    expect(() => parseBlob(new Uint8Array(0))).toThrow(CryptoFormatError)
    expect(() => parseBlob(new Uint8Array(1 + 12 + 16))).toThrow(CryptoFormatError) // kein Chiffretext
    expect(() => parseBlob(new Uint8Array(1 + 12 + MAX_PLAINTEXT_BYTES + 16 + 1))).toThrow(CryptoFormatError)
  })

  it('lehnt ungültige Felder ab', () => {
    expect(() => serializeBlob(blob({ nonce: sequence(11) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ nonce: sequence(13) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ tag: sequence(15) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ tag: sequence(17) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ ciphertext: new Uint8Array(0) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ ciphertext: new Uint8Array(MAX_PLAINTEXT_BYTES + 1) }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(blob({ nonce: 'abc' as unknown as Uint8Array }))).toThrow(CryptoFormatError)
    expect(() => serializeBlob(null as unknown as EncryptedBlob)).toThrow(CryptoFormatError)
  })

  it('decodeBlob lehnt ungültigen Text ab', () => {
    expect(() => decodeBlob('')).toThrow(CryptoFormatError)
    expect(() => decodeBlob('kein base64url!')).toThrow(CryptoFormatError)
    expect(() => decodeBlob('A'.repeat(MAX_PLAINTEXT_BYTES * 2))).toThrow(CryptoFormatError)
  })
})
