// ── Name tables ───────────────────────────────────────────────────────────────

const WEEKDAY_FULL: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

const WEEKDAY_ABBREV: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
}

const MONTH_FULL: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const MONTH_ABBREV: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function weekday(s: string): number | undefined {
  return WEEKDAY_FULL[s] ?? WEEKDAY_ABBREV[s]
}

const WORD_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
}

function ordinalN(s: string): number | null {
  const word = WORD_ORDINALS[s]
  if (word !== undefined) return word
  const m = s.match(/^([1-5])(?:st|nd|rd|th)?$/)
  return m ? parseInt(m[1]!, 10) : null
}

function month(s: string): number | undefined {
  return MONTH_FULL[s] ?? MONTH_ABBREV[s]
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toDateString(d)
}

export function nextWeekday(today: string, targetDay: number): string {
  const todayDay = new Date(today + 'T00:00:00Z').getUTCDay()
  let daysAhead = (targetDay - todayDay + 7) % 7
  if (daysAhead === 0) daysAhead = 7
  return addDays(today, daysAhead)
}

function findNthWeekdayInMonth(year: number, mo: number, n: number, dow: number): string | null {
  const firstDow = new Date(Date.UTC(year, mo, 1)).getUTCDay()
  const day = 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7
  const candidate = new Date(Date.UTC(year, mo, day))
  if (candidate.getUTCMonth() !== mo) return null
  return toDateString(candidate)
}

function findLastWeekdayInMonth(year: number, mo: number, dow: number): string {
  const last = new Date(Date.UTC(year, mo + 1, 0))
  const day = last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7)
  return toDateString(new Date(Date.UTC(year, mo, day)))
}

function nextDayOfMonth(today: string, day: number): string | null {
  if (day < 1 || day > 31) return null
  const d = new Date(today + 'T00:00:00Z')
  let m = d.getUTCMonth()
  const y = d.getUTCFullYear()
  if (day <= d.getUTCDate()) m += 1
  for (let i = 0; i < 12; i++) {
    const candidate = new Date(Date.UTC(y, m + i, day))
    if (candidate.getUTCDate() === day) return toDateString(candidate)
  }
  return null
}

function resolveMonthDay(today: string, m: number, day: number, year: number | undefined): string | null {
  const todayDate = new Date(today + 'T00:00:00Z')
  const targetYear = year ?? (() => {
    const thisYear = todayDate.getUTCFullYear()
    const candidate = new Date(Date.UTC(thisYear, m, day))
    return candidate <= todayDate ? thisYear + 1 : thisYear
  })()
  const target = new Date(Date.UTC(targetYear, m, day))
  if (target.getUTCMonth() !== m) return null
  return toDateString(target)
}

// ── Due date parsing ──────────────────────────────────────────────────────────

type ParsedDate =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'next-week' }
  | { kind: 'weekday'; day: number; includeToday: boolean }
  | { kind: 'in-n-days'; n: number }
  | { kind: 'day-of-month'; day: number }
  | { kind: 'month-day'; month: number; day: number; year: number | undefined }

function parseYear(s: string): number {
  return s.length === 2 ? 2000 + parseInt(s, 10) : parseInt(s, 10)
}

function parseDateInput(input: string): ParsedDate | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()

  if (lower === 'today' || lower === 'tod') return { kind: 'today' }
  if (lower === 'tomorrow' || lower === 'tom') return { kind: 'tomorrow' }
  if (lower === 'next week') return { kind: 'next-week' }

  // "(next|this) <weekday>" or bare "<weekday>" or bare "<month>"
  const wordM = lower.match(/^(next\s+|this\s+)?([a-z]+)$/)
  if (wordM) {
    const prefix = wordM[1]?.trim() ?? ''
    const word = wordM[2]!
    const wd = weekday(word)
    if (wd !== undefined) return { kind: 'weekday', day: wd, includeToday: prefix === 'this' }
    if (!prefix) {
      const mo = month(word)
      if (mo !== undefined) return { kind: 'month-day', month: mo, day: 1, year: undefined }
    }
    return null
  }

  const inDaysM = lower.match(/^in (\d+) days?$/)
  if (inDaysM) return { kind: 'in-n-days', n: parseInt(inDaysM[1]!, 10) }

  const dayNumM = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?$/)
  if (dayNumM) return { kind: 'day-of-month', day: parseInt(dayNumM[1]!, 10) }

  const isoM = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoM) {
    const y = parseInt(isoM[1]!, 10), mo = parseInt(isoM[2]!, 10) - 1, d = parseInt(isoM[3]!, 10)
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return { kind: 'month-day', month: mo, day: d, year: y }
  }

  // "<month> <day>" or "<month> <day> <year>"
  const mDayM = lower.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}|\d{2}))?$/)
  if (mDayM) {
    const mo = month(mDayM[1]!), d = parseInt(mDayM[2]!, 10)
    if (mo !== undefined && d >= 1 && d <= 31)
      return { kind: 'month-day', month: mo, day: d, year: mDayM[3] !== undefined ? parseYear(mDayM[3]) : undefined }
  }

  // "<day> <month>" or "<day> <month> <year>"
  const dMonM = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}|\d{2}))?$/)
  if (dMonM) {
    const d = parseInt(dMonM[1]!, 10), mo = month(dMonM[2]!)
    if (mo !== undefined && d >= 1 && d <= 31)
      return { kind: 'month-day', month: mo, day: d, year: dMonM[3] !== undefined ? parseYear(dMonM[3]) : undefined }
  }

  // UK numeric: DD/MM, DD/MM/YY, DD/MM/YYYY
  const ukM = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (ukM) {
    const d = parseInt(ukM[1]!, 10), mo = parseInt(ukM[2]!, 10) - 1
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11)
      return { kind: 'month-day', month: mo, day: d, year: ukM[3] !== undefined ? parseYear(ukM[3]) : undefined }
  }

  return null
}

function resolveDate(parsed: ParsedDate, today: string): string | null {
  switch (parsed.kind) {
    case 'today':       return today
    case 'tomorrow':    return addDays(today, 1)
    case 'next-week':   return nextWeekday(today, 1)
    case 'weekday': {
      const todayDay = new Date(today + 'T00:00:00Z').getUTCDay()
      if (parsed.includeToday && parsed.day === todayDay) return today
      return nextWeekday(today, parsed.day)
    }
    case 'in-n-days':   return addDays(today, parsed.n)
    case 'day-of-month': return nextDayOfMonth(today, parsed.day)
    case 'month-day':   return resolveMonthDay(today, parsed.month, parsed.day, parsed.year)
  }
}

export function parseDueDate(input: string, today: string): string | null {
  const parsed = parseDateInput(input)
  return parsed !== null ? resolveDate(parsed, today) : null
}

// ── Recurrence ────────────────────────────────────────────────────────────────

type ParsedExpression =
  | { kind: 'interval'; days: number }
  | { kind: 'weekday'; dayOfWeek: number }
  | { kind: 'workday' }
  | { kind: 'weekend' }
  | { kind: 'monthly-specific'; dayOfMonth: number }
  | { kind: 'monthly-relative'; n: number }
  | { kind: 'nth-weekday-of-month'; n: number; dayOfWeek: number }
  | { kind: 'last-weekday-of-month'; dayOfWeek: number }
  | { kind: 'yearly-specific'; month: number; day: number }
  | { kind: 'yearly-relative'; n: number }
  | { kind: 'nth-weekday-of-year'; n: number; dayOfWeek: number; month: number }
  | { kind: 'last-weekday-of-year'; dayOfWeek: number; month: number }

function parseExpression(expression: string): ParsedExpression | null {
  const s = expression.toLowerCase().trim().replace(/!/g, '')

  // ── aliases ────────────────────────────────────────────────────────────────
  if (s === 'daily')                      return { kind: 'interval', days: 1 }
  if (s === 'weekly')                     return { kind: 'interval', days: 7 }
  if (s === 'fortnightly')                return { kind: 'interval', days: 14 }
  if (s === 'monthly')                    return { kind: 'monthly-relative', n: 1 }
  if (s === 'quarterly')                  return { kind: 'monthly-relative', n: 3 }
  if (s === 'yearly' || s === 'annually') return { kind: 'yearly-relative', n: 1 }

  // ── "every …" / "ev …" patterns ──────────────────────────────────────────
  const everyM = s.match(/^(?:every|ev) (.+)$/)
  if (!everyM) return null
  const rest = everyM[1]!

  if (rest === 'other week') return { kind: 'interval', days: 14 }

  if (rest === 'day')                             return { kind: 'interval', days: 1 }
  if (rest === 'week')                            return { kind: 'interval', days: 7 }
  if (rest === 'month')                           return { kind: 'monthly-relative', n: 1 }
  if (rest === 'year')                            return { kind: 'yearly-relative', n: 1 }
  if (rest === 'workday' || rest === 'weekday')   return { kind: 'workday' }
  if (rest === 'weekend')                         return { kind: 'weekend' }

  const daysM = rest.match(/^(\d+) days?$/)
  if (daysM) { const n = parseInt(daysM[1]!, 10); return n >= 1 ? { kind: 'interval', days: n } : null }

  const weeksM = rest.match(/^(\d+) weeks?$/)
  if (weeksM) { const n = parseInt(weeksM[1]!, 10); return n >= 1 ? { kind: 'interval', days: n * 7 } : null }

  const monthsM = rest.match(/^(\d+) months?$/)
  if (monthsM) { const n = parseInt(monthsM[1]!, 10); return n >= 1 ? { kind: 'monthly-relative', n } : null }

  const yearsM = rest.match(/^(\d+) years?$/)
  if (yearsM) { const n = parseInt(yearsM[1]!, 10); return n >= 1 ? { kind: 'yearly-relative', n } : null }

  // "every <weekday>" (full or abbreviated)
  const wordM = rest.match(/^([a-z]+)$/)
  if (wordM) {
    const wd = weekday(wordM[1]!)
    if (wd !== undefined) return { kind: 'weekday', dayOfWeek: wd }
    return null
  }

  // "every <N>[st/nd/rd/th]" — ordinal monthly (1–28)
  const ordM = rest.match(/^(\d+)(?:st|nd|rd|th)?$/)
  if (ordM) {
    const d = parseInt(ordM[1]!, 10)
    if (d >= 1 && d <= 28) return { kind: 'monthly-specific', dayOfMonth: d }
    return null
  }

  // "every <ordinal> <weekday> in/of <month>" — Nth weekday of a specific month yearly
  const nthWdYM = rest.match(/^([a-z0-9]+(?:st|nd|rd|th)?) ([a-z]+) (?:in|of) ([a-z]+)$/)
  if (nthWdYM) {
    const n = ordinalN(nthWdYM[1]!), wd = weekday(nthWdYM[2]!), mo = month(nthWdYM[3]!)
    if (n !== null && wd !== undefined && mo !== undefined)
      return { kind: 'nth-weekday-of-year', n, dayOfWeek: wd, month: mo }
    // Fall through to "last <weekday> in/of <month>" if n is null (e.g. "last")
  }

  // "every last <weekday> in/of <month>" — last weekday of a specific month yearly
  const lastWdYM = rest.match(/^last ([a-z]+) (?:in|of) ([a-z]+)$/)
  if (lastWdYM) {
    const wd = weekday(lastWdYM[1]!), mo = month(lastWdYM[2]!)
    if (wd !== undefined && mo !== undefined)
      return { kind: 'last-weekday-of-year', dayOfWeek: wd, month: mo }
    return null
  }

  // "every <ordinal> <weekday>" — Nth weekday of month (fall through if word is a month name, not weekday)
  const nthWdM = rest.match(/^([a-z0-9]+(?:st|nd|rd|th)?) ([a-z]+)$/)
  if (nthWdM) {
    const n = ordinalN(nthWdM[1]!)
    const wd = weekday(nthWdM[2]!)
    if (n !== null && wd !== undefined) return { kind: 'nth-weekday-of-month', n, dayOfWeek: wd }
    // Fall through — could be a reversed yearly date like "1st jan"
  }

  // "every last <weekday>" — last weekday of month
  const lastWdM = rest.match(/^last ([a-z]+)$/)
  if (lastWdM) {
    const wd = weekday(lastWdM[1]!)
    if (wd !== undefined) return { kind: 'last-weekday-of-month', dayOfWeek: wd }
    return null
  }

  // "every <month> <day>[ordinal]" — yearly specific (full or abbreviated month, day 1–28)
  const yrM = rest.match(/^([a-z]+) (\d+)(?:st|nd|rd|th)?$/)
  if (yrM) {
    const mo = month(yrM[1]!), d = parseInt(yrM[2]!, 10)
    if (mo !== undefined && d >= 1 && d <= 28) return { kind: 'yearly-specific', month: mo, day: d }
    return null
  }

  // "every <day>[ordinal] <month>" — reversed yearly specific (e.g. "ev 3 jan", "ev 10th feb")
  const yrRevM = rest.match(/^(\d+)(?:st|nd|rd|th)? ([a-z]+)$/)
  if (yrRevM) {
    const d = parseInt(yrRevM[1]!, 10), mo = month(yrRevM[2]!)
    if (mo !== undefined && d >= 1 && d <= 28) return { kind: 'yearly-specific', month: mo, day: d }
    return null
  }

  return null
}

export function isValidExpression(expression: string): boolean {
  return parseExpression(expression) !== null
}

export function nextDueDate(expression: string, completedAt: string): string | null {
  const parsed = parseExpression(expression)
  if (!parsed) return null

  const base = new Date(completedAt + 'T00:00:00Z')

  switch (parsed.kind) {
    case 'interval':
      return toDateString(new Date(Date.UTC(
        base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + parsed.days,
      )))

    case 'weekday':
      return nextWeekday(addDays(completedAt, 1), parsed.dayOfWeek)

    case 'workday': {
      const next = addDays(completedAt, 1)
      const d = new Date(next + 'T00:00:00Z')
      const dow = d.getUTCDay()
      if (dow === 6) return addDays(next, 2) // Saturday → Monday
      if (dow === 0) return addDays(next, 1) // Sunday → Monday
      return next
    }

    case 'weekend': {
      const next = addDays(completedAt, 1)
      const dow = new Date(next + 'T00:00:00Z').getUTCDay()
      if (dow === 6 || dow === 0) return next // Already Sat or Sun
      return addDays(next, 6 - dow) // Next Saturday
    }

    case 'nth-weekday-of-month': {
      const base = addDays(completedAt, 1)
      const d = new Date(base + 'T00:00:00Z')
      let year = d.getUTCFullYear(), mo = d.getUTCMonth()
      for (let i = 0; i < 13; i++) {
        const candidate = findNthWeekdayInMonth(year, mo, parsed.n, parsed.dayOfWeek)
          ?? findLastWeekdayInMonth(year, mo, parsed.dayOfWeek)
        if (new Date(candidate + 'T00:00:00Z') >= d) return candidate
        if (++mo > 11) { mo = 0; year++ }
      }
      return null
    }

    case 'last-weekday-of-month': {
      const base = addDays(completedAt, 1)
      const d = new Date(base + 'T00:00:00Z')
      let year = d.getUTCFullYear(), mo = d.getUTCMonth()
      for (let i = 0; i < 13; i++) {
        const candidate = findLastWeekdayInMonth(year, mo, parsed.dayOfWeek)
        if (new Date(candidate + 'T00:00:00Z') >= d) return candidate
        if (++mo > 11) { mo = 0; year++ }
      }
      return null
    }

    case 'nth-weekday-of-year': {
      const base = addDays(completedAt, 1)
      const d = new Date(base + 'T00:00:00Z')
      let year = d.getUTCFullYear()
      for (let i = 0; i < 3; i++) {
        const candidate = findNthWeekdayInMonth(year, parsed.month, parsed.n, parsed.dayOfWeek)
          ?? findLastWeekdayInMonth(year, parsed.month, parsed.dayOfWeek)
        if (new Date(candidate + 'T00:00:00Z') >= d) return candidate
        year++
      }
      return null
    }

    case 'last-weekday-of-year': {
      const base = addDays(completedAt, 1)
      const d = new Date(base + 'T00:00:00Z')
      let year = d.getUTCFullYear()
      for (let i = 0; i < 3; i++) {
        const candidate = findLastWeekdayInMonth(year, parsed.month, parsed.dayOfWeek)
        if (new Date(candidate + 'T00:00:00Z') >= d) return candidate
        year++
      }
      return null
    }

    case 'monthly-specific':
      return nextDayOfMonth(addDays(completedAt, 1), parsed.dayOfMonth)

    case 'monthly-relative': {
      const rawMonth = base.getUTCMonth() + parsed.n
      const year = base.getUTCFullYear() + Math.floor(rawMonth / 12)
      const mo = rawMonth % 12
      const lastDay = new Date(Date.UTC(year, mo + 1, 0)).getUTCDate()
      return toDateString(new Date(Date.UTC(year, mo, Math.min(base.getUTCDate(), lastDay))))
    }

    case 'yearly-specific':
      return resolveMonthDay(addDays(completedAt, 1), parsed.month, parsed.day, undefined)

    case 'yearly-relative': {
      const mo = base.getUTCMonth(), day = base.getUTCDate()
      const targetYear = base.getUTCFullYear() + parsed.n
      const lastDay = new Date(Date.UTC(targetYear, mo + 1, 0)).getUTCDate()
      return toDateString(new Date(Date.UTC(targetYear, mo, Math.min(day, lastDay))))
    }
  }
}
