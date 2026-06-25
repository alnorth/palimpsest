import { parseWeekday, parseMonth } from './dateNames.js'

type Parsed =
  | { kind: 'interval'; days: number }
  | { kind: 'weekday'; dayOfWeek: number }
  | { kind: 'monthly-specific'; dayOfMonth: number }
  | { kind: 'monthly-relative'; n: number }
  | { kind: 'yearly-specific'; month: number; day: number }
  | { kind: 'yearly-relative'; n: number }

function parseExpression(expression: string): Parsed | null {
  const s = expression.toLowerCase().trim()

  // ── aliases ────────────────────────────────────────────────────────────────
  if (s === 'daily')       return { kind: 'interval', days: 1 }
  if (s === 'weekly')      return { kind: 'interval', days: 7 }
  if (s === 'fortnightly') return { kind: 'interval', days: 14 }
  if (s === 'monthly')     return { kind: 'monthly-relative', n: 1 }
  if (s === 'quarterly')   return { kind: 'monthly-relative', n: 3 }
  if (s === 'yearly' || s === 'annually') return { kind: 'yearly-relative', n: 1 }

  // ── "every …" patterns ────────────────────────────────────────────────────
  const everyMatch = s.match(/^every (.+)$/)
  if (!everyMatch) return null
  const rest = everyMatch[1]!

  // "every other week"
  if (rest === 'other week') return { kind: 'interval', days: 14 }

  // "every day" / "every N day(s)"
  if (rest === 'day') return { kind: 'interval', days: 1 }
  const daysM = rest.match(/^(\d+) days?$/)
  if (daysM) {
    const n = parseInt(daysM[1]!, 10)
    if (n < 1) return null
    return { kind: 'interval', days: n }
  }

  // "every week" / "every N week(s)"
  if (rest === 'week') return { kind: 'interval', days: 7 }
  const weeksM = rest.match(/^(\d+) weeks?$/)
  if (weeksM) {
    const n = parseInt(weeksM[1]!, 10)
    if (n < 1) return null
    return { kind: 'interval', days: n * 7 }
  }

  // "every month" / "every N month(s)"
  if (rest === 'month') return { kind: 'monthly-relative', n: 1 }
  const monthsM = rest.match(/^(\d+) months?$/)
  if (monthsM) {
    const n = parseInt(monthsM[1]!, 10)
    if (n < 1) return null
    return { kind: 'monthly-relative', n }
  }

  // "every year" / "every N year(s)"
  if (rest === 'year') return { kind: 'yearly-relative', n: 1 }
  const yearsM = rest.match(/^(\d+) years?$/)
  if (yearsM) {
    const n = parseInt(yearsM[1]!, 10)
    if (n < 1) return null
    return { kind: 'yearly-relative', n }
  }

  // "every <weekday>" (full or abbreviated)
  const weekdayOnly = rest.match(/^([a-z]+)$/)
  if (weekdayOnly) {
    const day = parseWeekday(weekdayOnly[1]!)
    if (day !== undefined) return { kind: 'weekday', dayOfWeek: day }
    return null
  }

  // "every <N>[st/nd/rd/th]" — ordinal monthly (1–28)
  const ordinalM = rest.match(/^(\d+)(?:st|nd|rd|th)?$/)
  if (ordinalM) {
    const d = parseInt(ordinalM[1]!, 10)
    if (d < 1 || d > 28) return null
    return { kind: 'monthly-specific', dayOfMonth: d }
  }

  // "every <month> <day>" — yearly specific (full or abbreviated month, day 1–28)
  const yearlyM = rest.match(/^([a-z]+) (\d+)$/)
  if (yearlyM) {
    const month = parseMonth(yearlyM[1]!)
    const day = parseInt(yearlyM[2]!, 10)
    if (month !== undefined && day >= 1 && day <= 28) {
      return { kind: 'yearly-specific', month, day }
    }
    return null
  }

  return null
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isValidExpression(expression: string): boolean {
  return parseExpression(expression) !== null
}

export function nextDueDate(expression: string, completedAt: string): string | null {
  const parsed = parseExpression(expression)
  if (!parsed) return null

  const base = new Date(completedAt + 'T00:00:00Z')

  switch (parsed.kind) {
    case 'interval': {
      return toDateString(new Date(Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + parsed.days,
      )))
    }

    case 'weekday': {
      const start = new Date(Date.UTC(
        base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1,
      ))
      const diff = (parsed.dayOfWeek - start.getUTCDay() + 7) % 7
      return toDateString(new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + (diff === 0 ? 7 : diff),
      )))
    }

    case 'monthly-specific': {
      const start = new Date(Date.UTC(
        base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1,
      ))
      let year = start.getUTCFullYear()
      let month = start.getUTCMonth()
      const candidate = new Date(Date.UTC(year, month, parsed.dayOfMonth))
      if (candidate >= start) return toDateString(candidate)
      month++
      if (month > 11) { month = 0; year++ }
      return toDateString(new Date(Date.UTC(year, month, parsed.dayOfMonth)))
    }

    case 'monthly-relative': {
      const day = base.getUTCDate()
      const rawMonth = base.getUTCMonth() + parsed.n
      const year = base.getUTCFullYear() + Math.floor(rawMonth / 12)
      const month = rawMonth % 12
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      return toDateString(new Date(Date.UTC(year, month, Math.min(day, lastDay))))
    }

    case 'yearly-specific': {
      const start = new Date(Date.UTC(
        base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1,
      ))
      const year = start.getUTCFullYear()
      const candidate = new Date(Date.UTC(year, parsed.month, parsed.day))
      if (candidate >= start) return toDateString(candidate)
      return toDateString(new Date(Date.UTC(year + 1, parsed.month, parsed.day)))
    }

    case 'yearly-relative': {
      const month = base.getUTCMonth()
      const day = base.getUTCDate()
      const targetYear = base.getUTCFullYear() + parsed.n
      const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate()
      return toDateString(new Date(Date.UTC(targetYear, month, Math.min(day, lastDay))))
    }
  }
}

