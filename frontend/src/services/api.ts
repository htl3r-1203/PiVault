// Einfacher API-Client für die Kommunikation mit dem FastAPI-Backend.
// Alle Pfade sind relativ zu /api. Apache leitet /api an das Backend weiter.

const API_BASE_URL = ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    // Feldbezogene Fehler des Backends, z. B. { password: 'Das Passwort muss …' }
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// CSRF-Token der aktuellen Session. Nur im Arbeitsspeicher, nie in localStorage/sessionStorage.
// Das Session-Token selbst liegt in einem HttpOnly-Cookie und ist für JavaScript unsichtbar.
let csrfToken: string | null = null
export const setCsrfToken = (token: string | null) => {
  csrfToken = token
}

// Wird bei 401 auf geschützten Endpunkten aufgerufen (Session abgelaufen)
let unauthorizedHandler: (() => void) | null = null
export const setUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandler = handler
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']

async function toApiError(response: Response): Promise<ApiError> {
  let message = `Anfrage fehlgeschlagen (${response.status})`
  const fieldErrors: Record<string, string> = {}
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') {
      message = body.detail
    } else if (Array.isArray(body.detail)) {
      for (const item of body.detail as { field?: string | null; message?: string }[]) {
        if (item.message && item.field) fieldErrors[item.field] = item.message
      }
      const first = (body.detail as { message?: string }[])[0]
      if (first?.message) message = first.message
    }
  } catch {
    // Antwort ohne JSON-Inhalt: allgemeine Meldung bleibt
  }
  return new ApiError(response.status, message, fieldErrors)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (csrfToken && !SAFE_METHODS.includes(method)) {
    headers['X-CSRF-Token'] = csrfToken
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      unauthorizedHandler?.()
    }
    throw await toApiError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
}

export interface HealthResponse {
  status: string
}

export const getHealth = () => api.get<HealthResponse>('/api/health')
