// Schnittstelle der Datenzugriffsschicht für den Tresor.
//
// Die UI spricht ausschließlich mit diesem Interface. Sobald Master-Passwort, clientseitige
// Verschlüsselung und Tresor-API existieren, kommt eine zweite Implementierung hinzu
// (verschlüsselt/entschlüsselt im Browser, überträgt nur Chiffretext) und ersetzt die
// Demo-Implementierung in services/vault/index.ts. Die Komponenten bleiben unverändert.

import type { EntryDraft, Vault, VaultEntry } from '@/types/vault'

export interface VaultRepository {
  /** true, solange die Daten nur Demo-Daten im Arbeitsspeicher sind */
  readonly isDemo: boolean
  /** true, wenn Tresordaten clientseitig verschlüsselt gespeichert werden */
  readonly isEncrypted: boolean

  listVaults(): Promise<Vault[]>
  listEntries(): Promise<VaultEntry[]>
  createEntry(draft: EntryDraft): Promise<VaultEntry>
  updateEntry(id: string, draft: EntryDraft): Promise<VaultEntry>
  setFavorite(id: string, favorite: boolean): Promise<VaultEntry>
  deleteEntry(id: string): Promise<void>
}
