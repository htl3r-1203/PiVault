// Zentraler Zustand für Tresore und Einträge. Spricht nur mit dem VaultRepository-Interface.
// Beim Abmelden (auch bei abgelaufener Session) wird der gesamte Zustand verworfen.

import { reactive, watch } from 'vue'
import { authState } from '@/services/auth'
import { createVaultRepository } from '@/services/vault'
import type { EntryDraft, Vault, VaultEntry } from '@/types/vault'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const state = reactive<{
  status: Status
  error: string
  vaults: Vault[]
  entries: VaultEntry[]
}>({ status: 'idle', error: '', vaults: [], entries: [] })

let repository = createVaultRepository()

function reset() {
  repository = createVaultRepository()
  state.status = 'idle'
  state.error = ''
  state.vaults = []
  state.entries = []
}

// Sobald keine Benutzer-Session mehr besteht, werden alle Tresordaten aus dem Speicher entfernt
watch(
  () => authState.user,
  (user) => {
    if (!user) reset()
  },
)

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

async function load() {
  state.status = 'loading'
  state.error = ''
  try {
    const [vaults, entries] = await Promise.all([repository.listVaults(), repository.listEntries()])
    state.vaults = vaults
    state.entries = entries
    state.status = 'ready'
  } catch (e) {
    state.error = errorMessage(e, 'Die Einträge konnten nicht geladen werden.')
    state.status = 'error'
  }
}

function replaceEntry(entry: VaultEntry) {
  const index = state.entries.findIndex((e) => e.id === entry.id)
  if (index >= 0) state.entries[index] = entry
  else state.entries.unshift(entry)
}

export function useVault() {
  return {
    state,
    get isDemo() {
      return repository.isDemo
    },
    get isEncrypted() {
      return repository.isEncrypted
    },
    ensureLoaded: async () => {
      if (state.status === 'idle') await load()
    },
    reload: load,
    vaultName: (id: string) => state.vaults.find((v) => v.id === id)?.name ?? 'Unbekannt',
    async createEntry(draft: EntryDraft) {
      const entry = await repository.createEntry(draft)
      replaceEntry(entry)
      return entry
    },
    async updateEntry(id: string, draft: EntryDraft) {
      const entry = await repository.updateEntry(id, draft)
      replaceEntry(entry)
      return entry
    },
    async setFavorite(id: string, favorite: boolean) {
      replaceEntry(await repository.setFavorite(id, favorite))
    },
    async deleteEntry(id: string) {
      await repository.deleteEntry(id)
      state.entries = state.entries.filter((e) => e.id !== id)
    },
  }
}
