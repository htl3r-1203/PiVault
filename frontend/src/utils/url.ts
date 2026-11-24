// Nur http(s)-Adressen werden als Link dargestellt (kein javascript:, data: usw.)

export function parseHttpUrl(value: string): URL | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

export const safeHref = (value: string): string | null => parseHttpUrl(value)?.href ?? null

export const hostnameOf = (value: string): string => parseHttpUrl(value)?.hostname ?? ''
