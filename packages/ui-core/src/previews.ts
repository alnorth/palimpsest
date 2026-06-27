import { parseDueDate, isValidExpression, nextDueDate } from 'palimpsest'

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function formatDateWithDay(iso: string): string {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function getDueDatePreview(formValue: string, today: string): { text: string; ok: boolean } | undefined {
  if (formValue.trim() === '') return undefined
  const parsed = parseDueDate(formValue, today)
  if (parsed !== null) return { text: formatDateWithDay(parsed), ok: true }
  return { text: 'Can\'t parse — try "tomorrow", "next monday", "jul 4", "2026-12-25"', ok: false }
}

export function getRecurrencePreview(formValue: string, today: string): { text: string; ok: boolean } | undefined {
  const trimmed = formValue.trim()
  if (trimmed === '') return undefined
  if (!isValidExpression(trimmed)) return { text: 'Invalid expression', ok: false }
  const dates: string[] = []
  let cur = today
  for (let i = 0; i < 3; i++) {
    const next = nextDueDate(trimmed, cur)
    if (next === null) break
    dates.push(formatDateWithDay(next))
    cur = next
  }
  if (dates.length === 0) return { text: 'No future dates for this expression', ok: false }
  return { text: dates.join(' · '), ok: true }
}
