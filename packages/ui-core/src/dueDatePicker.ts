const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTH_NAMES_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_NAMES_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

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

function parseMonth(s: string): number | null {
  const lower = s.toLowerCase()
  const shortIdx = MONTH_NAMES_SHORT.indexOf(lower)
  if (shortIdx !== -1) return shortIdx
  const fullIdx = MONTH_NAMES_FULL.indexOf(lower)
  if (fullIdx !== -1) return fullIdx
  return null
}

function nextDayOfMonth(today: string, day: number): string | null {
  if (day < 1 || day > 31) return null
  const todayDate = new Date(today + 'T00:00:00Z')
  let year = todayDate.getUTCFullYear()
  let month = todayDate.getUTCMonth()
  // Try current month first; if the day has passed (or is today), advance to next month
  if (day <= todayDate.getUTCDate()) month += 1
  // Find the first month from `month` onward where this day exists
  for (let i = 0; i < 12; i++) {
    const candidate = new Date(Date.UTC(year, month + i, day))
    if (candidate.getUTCDate() === day) return candidate.toISOString().slice(0, 10)
    // Date.UTC rolls over (e.g. Feb 30 → Mar 1/2), skip if the month rolled
  }
  return null
}

function resolveMonthDay(today: string, monthIdx: number, day: number, year: number | undefined): string | null {
  const todayDate = new Date(today + 'T00:00:00Z')
  const targetYear = year ?? (() => {
    const thisYear = todayDate.getUTCFullYear()
    const candidate = new Date(Date.UTC(thisYear, monthIdx, day))
    return candidate < todayDate ? thisYear + 1 : thisYear
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
  if (lower === 'next week') return addDays(today, 7)

  const weekdayMatch = lower.match(/^(?:next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)$/)
  if (weekdayMatch) {
    const name = weekdayMatch[1]!
    const targetDay = WEEKDAY_NAMES.indexOf(name) !== -1 ? WEEKDAY_NAMES.indexOf(name) : WEEKDAY_ABBREVS.indexOf(name)
    return nextWeekday(today, targetDay)
  }

  const inDaysMatch = lower.match(/^in (\d+) days?$/)
  if (inDaysMatch) {
    const n = parseInt(inDaysMatch[1]!, 10)
    if (n > 0) return addDays(today, n)
  }

  const dayNumberMatch = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?$/)
  if (dayNumberMatch) return nextDayOfMonth(today, parseInt(dayNumberMatch[1]!, 10))

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const d = new Date(lower + 'T00:00:00Z')
    if (!isNaN(d.getTime())) return lower
  }

  const bareMonthIdx = parseMonth(lower)
  if (bareMonthIdx !== null) return resolveMonthDay(today, bareMonthIdx, 1, undefined)

  const monthDayMatch = lower.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/)
  if (monthDayMatch) {
    const monthIdx = parseMonth(monthDayMatch[1]!)
    const day = parseInt(monthDayMatch[2]!, 10)
    if (monthIdx !== null && day >= 1 && day <= 31) {
      return resolveMonthDay(today, monthIdx, day, monthDayMatch[3] !== undefined ? parseInt(monthDayMatch[3], 10) : undefined)
    }
  }

  const dayMonthMatch = lower.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/)
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]!, 10)
    const monthIdx = parseMonth(dayMonthMatch[2]!)
    if (monthIdx !== null && day >= 1 && day <= 31) {
      return resolveMonthDay(today, monthIdx, day, dayMonthMatch[3] !== undefined ? parseInt(dayMonthMatch[3], 10) : undefined)
    }
  }

  return null
}
