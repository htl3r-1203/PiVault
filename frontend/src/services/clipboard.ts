// Kopieren in die Zwischenablage. navigator.clipboard gibt es nur in sicheren Kontexten
// (HTTPS oder localhost). Im reinen HTTP-Betrieb über eine IP-Adresse ist die API nicht verfügbar.

export async function copyToClipboard(text: string): Promise<void> {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) {
    throw new Error(
      'Kopieren ist nur über HTTPS oder localhost möglich. Im aktuellen HTTP-Betrieb bitte den Text manuell markieren und kopieren.',
    )
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    throw new Error('Der Browser hat den Zugriff auf die Zwischenablage verweigert.')
  }
}

export const isClipboardAvailable = (): boolean =>
  window.isSecureContext && typeof navigator.clipboard?.writeText === 'function'
