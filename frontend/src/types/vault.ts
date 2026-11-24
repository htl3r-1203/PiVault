// Datentypen des Tresors. Diese Typen sind unabhängig davon, woher die Daten kommen
// (heute: Demo-Daten im Arbeitsspeicher, später: clientseitig entschlüsselte Backend-Daten).

export interface Vault {
  id: string
  name: string
}

export interface VaultEntry {
  id: string
  vaultId: string
  name: string
  username: string
  password: string
  url: string
  notes: string
  favorite: boolean
  /** ISO-8601-Zeitstempel der letzten Änderung */
  updatedAt: string
}

/** Vom Benutzer bearbeitbare Felder eines Eintrags */
export interface EntryDraft {
  vaultId: string
  name: string
  username: string
  password: string
  url: string
  notes: string
}
