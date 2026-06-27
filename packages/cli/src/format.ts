import { MONTHS } from 'palimpsest-ui-core'
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dueDateColor(dueDate: string): 'green' | 'red' | undefined {
  const today = localToday()
  if (dueDate === today) return 'green'
  if (dueDate < today) return 'red'
  return undefined
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${h}:${m}`
}
