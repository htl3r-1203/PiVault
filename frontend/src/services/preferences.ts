// Nicht sensible UI-Einstellungen (Design, Sidebar-Zustand) im localStorage.
// Hier werden niemals Zugangsdaten, Passwörter oder Tresordaten abgelegt.
// Der Speicher kann fehlen oder blockiert sein; die Oberfläche funktioniert dann trotzdem.

import { reactive } from 'vue'

export type ThemePreference = 'dark' | 'light' | 'system'

const THEME_KEY = 'pivault.ui.theme'
const SIDEBAR_KEY = 'pivault.ui.sidebarCollapsed'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Speicher nicht verfügbar: Einstellung gilt nur für diese Sitzung
  }
}

export const themeState = reactive<{ preference: ThemePreference }>({ preference: 'dark' })

function resolveTheme(preference: ThemePreference): 'dark' | 'light' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return preference
}

function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(themeState.preference)
}

export function initTheme() {
  const stored = read(THEME_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    themeState.preference = stored
  }
  applyTheme()
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (themeState.preference === 'system') applyTheme()
  })
}

export function setTheme(preference: ThemePreference) {
  themeState.preference = preference
  write(THEME_KEY, preference)
  applyTheme()
}

export const getSidebarCollapsed = (): boolean => read(SIDEBAR_KEY) === '1'
export const setSidebarCollapsed = (collapsed: boolean) => write(SIDEBAR_KEY, collapsed ? '1' : '0')
