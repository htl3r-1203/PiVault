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
