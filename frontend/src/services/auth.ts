// Authentifizierungsstatus und Auth-Aufrufe.
// Der Status wird immer über GET /api/auth/me ermittelt; gespeichert wird nichts im Browser-Speicher.
// Hier geht es nur um das Login-Passwort. Das Master-Passwort des Tresors wird nie an das Backend gesendet.

import { reactive } from 'vue'
import { api, setCsrfToken } from './api'

export interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  email_verified: boolean
}

interface AuthResponse {
  user: User
  csrf_token: string
}

export interface RegisterPayload {
  username: string
  first_name: string
  last_name: string
  email: string
  password: string
}

export const authState = reactive<{ user: User | null; loaded: boolean }>({
  user: null,
  loaded: false,
})

function setSession(response: AuthResponse | null) {
  authState.user = response?.user ?? null
  setCsrfToken(response?.csrf_token ?? null)
}

export function clearUser() {
  setSession(null)
}

// Fragt das Backend, ob eine gültige Session besteht
export async function loadUser(): Promise<void> {
  try {
    setSession(await api.get<AuthResponse>('/api/auth/me'))
  } catch {
    // 401 (keine Session) oder Backend nicht erreichbar: als nicht angemeldet behandeln
    setSession(null)
  } finally {
    authState.loaded = true
  }
}

export async function login(identifier: string, password: string): Promise<void> {
  setSession(await api.post<AuthResponse>('/api/auth/login', { identifier, password }))
  authState.loaded = true
}

export async function register(payload: RegisterPayload): Promise<void> {
  await api.post<User>('/api/auth/register', payload)
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>('/api/auth/logout')
  } finally {
    // Lokalen Zustand in jedem Fall verwerfen
    clearUser()
  }
}
