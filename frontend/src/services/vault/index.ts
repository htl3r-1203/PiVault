// Einziger Ort, an dem die konkrete Tresor-Implementierung gewählt wird.
// Später hier die verschlüsselte Implementierung (Master-Passwort + Tresor-API) einsetzen.
import { createDemoVaultRepository } from './demoVaultRepository'
import type { VaultRepository } from './vaultRepository'

export type { VaultRepository }
export const createVaultRepository = (): VaultRepository => createDemoVaultRepository()
