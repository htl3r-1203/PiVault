// Passwortgenerator: vollständig clientseitig, ausschließlich crypto.getRandomValues().
// Math.random() wird bewusst nirgends verwendet.

export interface GeneratorOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
}

export const GENERATOR_LIMITS = { min: 8, max: 128 } as const

const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
} as const

type CharsetKey = keyof typeof CHARSETS
const CHARSET_KEYS = Object.keys(CHARSETS) as CharsetKey[]

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeneratorError'
  }
}

function getCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new GeneratorError(
      'Dieser Browser stellt keinen sicheren Zufallsgenerator bereit. Es wird kein Passwort erzeugt.',
    )
  }
  return c
}

/**
 * Gleichverteilte Zufallszahl in [0, max) ohne Modulo-Verzerrung (Rejection Sampling).
 */
function randomInt(max: number, cryptoApi: Crypto): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x1_0000_0000) {
    throw new GeneratorError('Ungültiger Zufallsbereich.')
  }
  const range = 0x1_0000_0000
  const limit = range - (range % max) // größtes Vielfaches von max, das in 2^32 passt
  const buffer = new Uint32Array(1)
  for (;;) {
    cryptoApi.getRandomValues(buffer)
    const value = buffer[0]!
    if (value < limit) return value % max
  }
}

function activeSets(options: GeneratorOptions): string[] {
  return CHARSET_KEYS.filter((key) => options[key]).map((key) => CHARSETS[key])
}

export function poolSize(options: GeneratorOptions): number {
  return activeSets(options).reduce((sum, set) => sum + set.length, 0)
}

export function generatePassword(options: GeneratorOptions): string {
  const sets = activeSets(options)
  if (sets.length === 0) {
    throw new GeneratorError('Bitte mindestens eine Zeichenart auswählen.')
  }
  const { length } = options
  if (!Number.isInteger(length) || length < GENERATOR_LIMITS.min || length > GENERATOR_LIMITS.max) {
    throw new GeneratorError(
      `Die Länge muss zwischen ${GENERATOR_LIMITS.min} und ${GENERATOR_LIMITS.max} liegen.`,
    )
  }

  const cryptoApi = getCrypto()
  const pool = sets.join('')
  const chars: string[] = []

  // Aus jeder gewählten Zeichenart mindestens ein Zeichen, der Rest aus dem gesamten Pool
  for (const set of sets) chars.push(set[randomInt(set.length, cryptoApi)]!)
  while (chars.length < length) chars.push(pool[randomInt(pool.length, cryptoApi)]!)

  // Fisher-Yates-Mischung, damit die garantierten Zeichen nicht vorne stehen
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, cryptoApi)
    const tmp = chars[i]!
    chars[i] = chars[j]!
    chars[j] = tmp
  }
  return chars.join('')
}

/** Grobe Schätzung der Entropie in Bit (Länge × log2 der Poolgröße) */
export function estimateEntropyBits(options: GeneratorOptions): number {
  const size = poolSize(options)
  return size > 1 ? Math.floor(options.length * Math.log2(size)) : 0
}

export type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong'

export function strengthOf(bits: number): { level: StrengthLevel; label: string } {
  if (bits < 50) return { level: 'weak', label: 'Schwach' }
  if (bits < 70) return { level: 'fair', label: 'Mittel' }
  if (bits < 100) return { level: 'good', label: 'Stark' }
  return { level: 'strong', label: 'Sehr stark' }
}
