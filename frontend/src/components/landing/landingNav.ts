// Navigationsziele der Startseite. Header und Footer verwenden dieselbe Liste.
import type { RouteLocationRaw } from 'vue-router'

export interface LandingNavItem {
  label: string
  to: RouteLocationRaw
}

export const LANDING_NAV: LandingNavItem[] = [
  { label: 'Startseite', to: { name: 'landing' } },
  { label: 'Funktionen', to: { name: 'landing', hash: '#funktionen' } },
  { label: 'Sicherheit', to: { name: 'landing', hash: '#sicherheit' } },
  { label: 'Über PiVault', to: { name: 'landing', hash: '#ueber' } },
]

export const GITHUB_URL = 'https://github.com/htl3r-1203/PiVault'
