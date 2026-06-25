import { parseWeekday, parseMonth, WEEKDAY_FULL, WEEKDAY_ABBREV } from './dateNames.js'

const WEEKDAY_PATTERN = [
  ...Object.keys(WEEKDAY_FULL),
  ...Object.keys(WEEKDAY_ABBREV),
].join('|')

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function nextWeekday(today: string, targetDay: number): string {
  const d = new Date(today + 'T00:00:00Z')
  const todayDay = d.getUTCDay()
  let daysAhead = (targetDay - todayDay + 7) % 7
  if (daysAhead === 0) daysAhead = 7
  return addDays(today, daysAhead)
}

function nextDayOfMonth(today: string, day: number): string | null {
  if (day < 1 || day > 31) return null
  const todayDate = new Date(today + 'T00:00:00Z')
  let year = todayDate.getUTCFullYear()
  let month = todayDate.getUTCMonth()
  if (day <= todayDate.getUTCDate()) month += 1
  for (let i = 0; i < 12; i++) {
    const candidate = new Date(Date.UTC(year, month + i, day))
    if (candidate.getUTCDate() === day) return candidate.toISOString().slice(0, 10)
  }
  return null
}

function parseYear(s: string): number {
  return s.length === 2 ? 2000 + parseInt(s, 10) : parseInt(s, 10)
}

function resolveMonthDay(today: string, monthIdx: number, day: number, year: number | undefined): string | null {
  const todayDate = new Date(today + 'T00:00:00Z')
  const targetYear = year ?? (() => {
    const thisYear = todayDate.getUTCFullYear()
    const candidate = new Date(Date.UTC(thisYear, monthIdx, day))
    return candidate <= todayDate ? thisYear + 1 : thisYear
  })()
  const target = new Date(Date.UTC(targetYear, monthIdx, day))
  if (target.getUTCMonth() !== monthIdx) return null
  return target.toISOString().slice(0, 10)
}

export function parseDueDate(input: string, today: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()

  if (lower === 'today' || lower === 'tod') return today
  if (lower === 'tomorrow' || lower === 'tom') return addDays(today, 1)
  if (lower === 'next week') return nextWeekday(today, 1)

  const weekdayMatch = lower.match(new RegExp(`^(next\\s+|this\\s+)?(${WEEKDAY_PATTERN})$`))
  if (weekdayMatch) {
    const prefix = weekdayMatch[1]?.trim() ?? ''
    const name = weekdayMatch[2]!
    const targetDay = parseWeekday(name)
    if (targetDay === undefined) return null
    const todayDay = new Date(today + 'T00:00:00Z').getUTCDay()
    if (prefix === 'this' && targetDay === todayDay) return today
    return nextWeekday(today, targetDay)
  }

  const inDaysMatch = lower.match(/^in (\d+) days?$/)
  if (inDaysMatch) {
    return addDays(today, parseInt(inDaysMatch[1]!, 10))
  }

  const dayNumberMatch = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?$/)
  if (dayNumberMatch) return nextDayOfMonth(today, parseInt(dayNumberMatch[1]!, 10))

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1]!, 10)
    const monthIdx = parseInt(isoMatch[2]!, 10) - 1
    const day = parseInt(isoMatch[3]!, 10)
    if (monthIdx >= 0 && monthIdx <= 11 && day >= 1 && day <= 31) {
      return resolveMonthDay(today, monthIdx, day, year)
    }
  }

  const bareMonthIdx = parseMonth(lower)
  if (bareMonthIdx !== undefined) return resolveMonthDay(today, bareMonthIdx, 1, undefined)

  const monthDayMatch = lower.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}|\d{2}))?$/)
  if (monthDayMatch) {
    const monthIdx = parseMonth(monthDayMatch[1]!)
    const day = parseInt(monthDayMatch[2]!, 10)
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      return resolveMonthDay(today, monthIdx, day, monthDayMatch[3] !== undefined ? parseYear(monthDayMatch[3]) : undefined)
    }
  }

  const dayMonthMatch = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}|\d{2}))?$/)
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]!, 10)
    const monthIdx = parseMonth(dayMonthMatch[2]!)
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      return resolveMonthDay(today, monthIdx, day, dayMonthMatch[3] !== undefined ? parseYear(dayMonthMatch[3]) : undefined)
    }
  }

  // UK numeric format: DD/MM, DD/MM/YY, DD/MM/YYYY
  const ukDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (ukDateMatch) {
    const day = parseInt(ukDateMatch[1]!, 10)
    const monthIdx = parseInt(ukDateMatch[2]!, 10) - 1
    if (day >= 1 && day <= 31 && monthIdx >= 0 && monthIdx <= 11) {
      const year = ukDateMatch[3] !== undefined ? parseYear(ukDateMatch[3]) : undefined
      return resolveMonthDay(today, monthIdx, day, year)
    }
  }

  return null
}
