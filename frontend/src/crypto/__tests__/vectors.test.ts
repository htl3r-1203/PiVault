// Bekannte Antworten (Known-Answer-Tests).
//
// A) NIST/McGrew-Testvektoren für AES-256-GCM (The Galois/Counter Mode of Operation, Anhang B,
//    Test Cases 13–16), direkt gegen die Web-Crypto-Implementierung der Laufzeitumgebung: Belegt, dass
//    die darunterliegende Plattform AES-256-GCM standardkonform ausführt.
// B) PiVault-Vektoren: Feste Eingaben (Schlüssel, Nonce, Klartext, Kontext) ergeben bytegenau dieselbe
//    Ausgabe wie eine unabhängige Referenzimplementierung (OpenSSL über Node, mit von Hand gebautem AAD).
//    Das sichert das AAD-Layout und die Aufteilung in Chiffretext und Tag gegen unbeabsichtigte Änderungen.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt, importAesKey } from '../aesGcm'
import { buildAad, type EncryptionContext } from '../format'
import { hex, toHex } from './helpers'

afterEach(() => vi.restoreAllMocks())

describe('A) NIST/McGrew AES-256-GCM (direkt über Web Crypto)', () => {
  const key = '00'.repeat(32)
  const key2 = 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308'
  const plain64 =
    'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
    '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255'
  const cipher64 =
    '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
    '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad'

  const vectors = [
    { name: 'Test Case 13 (leerer Klartext)', key, iv: '00'.repeat(12), aad: '', plain: '', cipher: '', tag: '530f8afbc74536b9a963b4f1c4cb738b' },
    { name: 'Test Case 14 (16 Nullbytes)', key, iv: '00'.repeat(12), aad: '', plain: '00000000000000000000000000000000', cipher: 'cea7403d4d606b6e074ec5d3baf39d18', tag: 'd0d1c8a799996bf0265b98b5d48ab919' },
    { name: 'Test Case 15 (64 Byte)', key: key2, iv: 'cafebabefacedbaddecaf888', aad: '', plain: plain64, cipher: cipher64, tag: 'b094dac5d93471bdec1a502270e3cc6c' },
    { name: 'Test Case 16 (60 Byte mit AAD)', key: key2, iv: 'cafebabefacedbaddecaf888', aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2', plain: plain64.slice(0, 120), cipher: cipher64.slice(0, 120), tag: '76fc6ece0f4e1768cddf8853bb2d551b' },
  ]

  it.each(vectors)('$name', async (v) => {
    const cryptoKey = await crypto.subtle.importKey('raw', hex(v.key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    const params = { name: 'AES-GCM', iv: hex(v.iv), additionalData: hex(v.aad), tagLength: 128 } as AesGcmParams
    const sealed = new Uint8Array(await crypto.subtle.encrypt(params, cryptoKey, hex(v.plain)))
    expect(toHex(sealed.slice(0, sealed.length - 16))).toBe(v.cipher)
    expect(toHex(sealed.slice(sealed.length - 16))).toBe(v.tag)
    const opened = new Uint8Array(await crypto.subtle.decrypt(params, cryptoKey, hex(v.cipher + v.tag)))
    expect(toHex(opened)).toBe(v.plain)
  })
})

describe('B) PiVault-Vektoren (Referenz: OpenSSL)', () => {
  const rawKey = Uint8Array.from({ length: 32 }, (_, i) => i)
  const nonce = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
  const plaintext = new TextEncoder().encode('PiVault-KAT: Passwort ✓')
  const ciphertext = 'b6712a4c30a776922924d3e9272aa1ad03db3662e697a0f00f'

  // Feste Nonce über den Zufallsgenerator einspeisen (encrypt() akzeptiert keine Nonce von außen)
  const fixNonce = () =>
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.set(nonce)
      return array
    }) as never)

  const cases: { name: string; context: EncryptionContext; aad: string; tag: string }[] = [
    {
      name: 'Eintrag (Benutzer 1, Tresor 2, Eintrag 3)',
      context: { purpose: 'entry', userId: 1, vaultId: 2, entryId: 3 },
      aad: '50564c540104000000010000000200000003',
      tag: '5f0beca0ed67b20a6160ec9baed60282',
    },
    {
      name: 'Tresorschlüssel (Benutzer 7)',
      context: { purpose: 'vault-key', userId: 7 },
      aad: '50564c540101000000070000000000000000',
      tag: '7f14a229416d183b4670277266349f90',
    },
  ]

  it.each(cases)('$name', async ({ context, aad, tag }) => {
    expect(toHex(buildAad(1, context))).toBe(aad)
    const key = await importAesKey(rawKey)

    fixNonce()
    const blob = await encrypt(key, plaintext, context)
    vi.restoreAllMocks()

    expect(blob.version).toBe(1)
    expect(toHex(blob.nonce)).toBe(toHex(nonce))
    expect(toHex(blob.ciphertext)).toBe(ciphertext)
    expect(toHex(blob.tag)).toBe(tag)
    expect(new TextDecoder().decode(await decrypt(key, blob, context))).toBe('PiVault-KAT: Passwort ✓')
  })

  it('der Vektor gilt nur für seinen Kontext', async () => {
    const key = await importAesKey(rawKey)
    const [entry, vaultKey] = cases as [(typeof cases)[0], (typeof cases)[1]]
    const blob = { version: 1, nonce, ciphertext: hex(ciphertext), tag: hex(entry.tag) }
    await expect(decrypt(key, blob, vaultKey.context)).rejects.toThrow()
  })
})
