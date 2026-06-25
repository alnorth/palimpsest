const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseExpression(expression: string):
  | { kind: 'daily' }
  | { kind: 'weekly'; dayOfWeek: number }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'yearly'; month: number; day: number }
  | null {

  if (expression === 'daily') {
    return { kind: 'daily' }
  }

  const weekly = expression.match(/^weekly:([a-z]+)$/)
  if (weekly) {
    const day = DAY_NAMES[weekly[1] ?? '']
    if (day === undefined) return null
    return { kind: 'weekly', dayOfWeek: day }
  }

  const monthly = expression.match(/^monthly:(\d+)$/)
  if (monthly) {
    const d = parseInt(monthly[1] ?? '', 10)
    if (d < 1 || d > 28) return null
    return { kind: 'monthly', dayOfMonth: d }
  }

  const yearly = expression.match(/^yearly:([a-z]+)-(\d+)$/)
  if (yearly) {
    const month = MONTH_NAMES[yearly[1] ?? '']
    const day = parseInt(yearly[2] ?? '', 10)
    if (month === undefined || day < 1 || day > 28) return null
    return { kind: 'yearly', month, day }
  }

  return null
}

export function isValidExpression(expression: string): boolean {
  return parseExpression(expression) !== null
}

export function nextDueDate(expression: string, completedAt: string): string | null {
  const parsed = parseExpression(expression)
  if (!parsed) return null

  // Start searching from the day after completedAt
  const after = new Date(completedAt + 'T00:00:00Z')
  const start = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate() + 1))

  switch (parsed.kind) {
    case 'daily': {
      return toDateString(start)
    }

    case 'weekly': {
      const diff = (parsed.dayOfWeek - start.getUTCDay() + 7) % 7
      return toDateString(new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + (diff === 0 ? 7 : diff),
      )))
    }

    case 'monthly': {
      let year = start.getUTCFullYear()
      let month = start.getUTCMonth()
      const candidate = new Date(Date.UTC(year, month, parsed.dayOfMonth))
      if (candidate >= start) return toDateString(candidate)
      month++
      if (month > 11) { month = 0; year++ }
      return toDateString(new Date(Date.UTC(year, month, parsed.dayOfMonth)))
    }

    case 'yearly': {
      let year = start.getUTCFullYear()
      const candidate = new Date(Date.UTC(year, parsed.month, parsed.day))
      if (candidate >= start) return toDateString(candidate)
      return toDateString(new Date(Date.UTC(year + 1, parsed.month, parsed.day)))
    }
  }
}
