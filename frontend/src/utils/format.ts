const dateTime = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' })
const date = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' })

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso))
export const formatDate = (iso: string): string => date.format(new Date(iso))

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 11) return 'Guten Morgen'
  if (hour < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export const initialOf = (text: string): string => (text.trim()[0] ?? '?').toUpperCase()
