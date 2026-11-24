// DEMO-Implementierung des Tresors.
//
// - Feste, offensichtlich erfundene Beispieldaten (keine echten Konten, keine echten Passwörter).
// - Alles liegt ausschließlich im Arbeitsspeicher dieser Seite. Es gibt keinen Netzwerkzugriff,
//   keinen localStorage, sessionStorage oder IndexedDB. Ein Neuladen setzt alles zurück.
// - Es findet KEINE Verschlüsselung statt.

import type { EntryDraft, Vault, VaultEntry } from '@/types/vault'
import type { VaultRepository } from './vaultRepository'

const DEMO_VAULTS: Vault[] = [
  { id: 'demo-privat', name: 'Privat' },
  { id: 'demo-arbeit', name: 'Schule & Arbeit' },
  { id: 'demo-familie', name: 'Familie' },
]

const DEMO_NOTE = 'Demo-Eintrag mit erfundenen Daten.'

function seedEntries(): VaultEntry[] {
  return [
    {
      id: 'demo-1',
      vaultId: 'demo-privat',
      name: 'Beispiel-Mail',
      username: 'max.beispiel@example.invalid',
      password: 'DEMO-Passwort-001',
      url: 'https://mail.example.com',
      notes: DEMO_NOTE,
      favorite: true,
      updatedAt: '2026-11-18T08:15:00Z',
    },
    {
      id: 'demo-2',
      vaultId: 'demo-privat',
      name: 'Beispiel-Shop',
      username: 'max_beispiel',
      password: 'DEMO-Passwort-002',
      url: 'https://shop.example.com/login',
      notes: `${DEMO_NOTE}\nZweite Zeile einer Notiz.`,
      favorite: false,
      updatedAt: '2026-11-02T17:40:00Z',
    },
    {
      id: 'demo-3',
      vaultId: 'demo-arbeit',
      name: 'Lernplattform',
      username: 'schueler.demo',
      password: 'DEMO-Passwort-003',
      url: 'https://lernen.example.org',
      notes: DEMO_NOTE,
      favorite: true,
      updatedAt: '2026-11-20T11:05:00Z',
    },
    {
      id: 'demo-4',
      vaultId: 'demo-arbeit',
      name: 'Code-Hosting',
      username: 'demo-entwickler',
      password: 'DEMO-Passwort-004',
      url: 'https://git.example.net',
      notes: DEMO_NOTE,
      favorite: false,
      updatedAt: '2026-10-29T13:20:00Z',
    },
    {
      id: 'demo-5',
      vaultId: 'demo-arbeit',
      name: 'Projekt-Wiki',
      username: 'demo.team',
      password: 'DEMO-Passwort-005',
      url: 'https://wiki.example.org',
      notes: '',
      favorite: false,
      updatedAt: '2026-09-14T09:00:00Z',
    },
    {
      id: 'demo-6',
      vaultId: 'demo-familie',
      name: 'Streaming-Abo',
      username: 'familie@example.invalid',
      password: 'DEMO-Passwort-006',
      url: 'https://streaming.example.com',
      notes: `${DEMO_NOTE}\nGemeinsames Konto (erfunden).`,
      favorite: true,
      updatedAt: '2026-11-11T19:30:00Z',
    },
    {
      id: 'demo-7',
      vaultId: 'demo-familie',
      name: 'WLAN-Router',
      username: 'admin',
      password: 'DEMO-Passwort-007',
      url: '',
      notes: 'Ohne Website-URL (Beispiel für ein Gerät im Heimnetz).',
      favorite: false,
      updatedAt: '2026-08-03T10:10:00Z',
    },
  ]
}

const copy = <T>(value: T): T => structuredClone(value)

export function createDemoVaultRepository(): VaultRepository {
  let entries = seedEntries()
  let counter = 0

  const find = (id: string): VaultEntry => {
    const entry = entries.find((e) => e.id === id)
    if (!entry) throw new Error('Der Eintrag existiert nicht mehr.')
    return entry
  }

  const assertVault = (vaultId: string) => {
    if (!DEMO_VAULTS.some((v) => v.id === vaultId)) throw new Error('Der gewählte Tresor existiert nicht.')
  }

  return {
    isDemo: true,
    isEncrypted: false,

    async listVaults() {
      return copy(DEMO_VAULTS)
    },

    async listEntries() {
      return copy(entries)
    },

    async createEntry(draft) {
      assertVault(draft.vaultId)
      counter += 1
      const entry: VaultEntry = {
        ...draft,
        id: `demo-neu-${counter}`,
        favorite: false,
        updatedAt: new Date().toISOString(),
      }
      entries = [entry, ...entries]
      return copy(entry)
    },

    async updateEntry(id: string, draft: EntryDraft) {
      assertVault(draft.vaultId)
      const entry = find(id)
      Object.assign(entry, draft, { updatedAt: new Date().toISOString() })
      return copy(entry)
    },

    async setFavorite(id, favorite) {
      const entry = find(id)
      entry.favorite = favorite
      return copy(entry)
    },

    async deleteEntry(id) {
      find(id)
      entries = entries.filter((e) => e.id !== id)
    },
  }
}
