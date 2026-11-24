// Hilfsfunktionen nur für die Tests (kein Produktionscode).

export const hex = (text: string): Uint8Array<ArrayBuffer> => {
  const clean = text.replace(/\s+/g, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export const sequence = (length: number, start = 0): Uint8Array<ArrayBuffer> => Uint8Array.from({ length }, (_, i) => (start + i) & 255)

/** Kopie mit einem umgedrehten Bit an Position `index` */
export const flipBit = (bytes: Uint8Array, index: number): Uint8Array => {
  const copy = new Uint8Array(bytes)
  copy[index] = copy[index]! ^ 0x01
  return copy
}

// ---- KDF/KEK-Hilfen ---------------------------------------------------------------------------------

import type { KdfParams, KdfRunner } from '../kdf'

/** Kleinste erlaubte Parameter: hält Tests mit echtem Argon2id kurz */
export const MIN_PARAMS: KdfParams = { v: 1, alg: 'argon2id', m: 19_456, t: 2, p: 1, len: 32 }

/**
 * Ein KEK ist nicht auslesbar. Zwei KEKs sind genau dann gleich, wenn sie denselben festen Probeschlüssel
 * mit fester Nonce zu demselben Chiffretext verpacken.
 */
export async function fingerprint(kek: CryptoKey): Promise<string> {
  const probe = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM' }, true, ['encrypt'])
  const out = await crypto.subtle.wrapKey('raw', probe, kek, { name: 'AES-GCM', iv: new Uint8Array(12) })
  return toHex(new Uint8Array(out))
}

export async function kekFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['wrapKey', 'unwrapKey'])
}

/** Schneller Ersatz für Argon2id in Tests, die nicht die KDF selbst prüfen: hängt von Passwort, Salt und Parametern ab */
export const fakeRunner: KdfRunner = async ({ password, salt, params }) => {
  const meta = new TextEncoder().encode(JSON.stringify(params))
  const input = new Uint8Array(password.length + salt.length + meta.length)
  input.set(password, 0)
  input.set(salt, password.length)
  input.set(meta, password.length + salt.length)
  return kekFromRaw(new Uint8Array(await crypto.subtle.digest('SHA-256', input)))
}
