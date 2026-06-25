import { describe, it, expect } from 'vitest'
import { isValidExpression, nextDueDate } from './recurrence.js'

describe('isValidExpression', () => {
  describe('interval aliases', () => {
    it('accepts shorthand aliases', () => {
      expect(isValidExpression('daily')).toBe(true)
      expect(isValidExpression('weekly')).toBe(true)
      expect(isValidExpression('fortnightly')).toBe(true)
      expect(isValidExpression('monthly')).toBe(true)
      expect(isValidExpression('quarterly')).toBe(true)
      expect(isValidExpression('yearly')).toBe(true)
      expect(isValidExpression('annually')).toBe(true)
    })
  })

  describe('"every …" patterns', () => {
    it('accepts day/week interval expressions', () => {
      expect(isValidExpression('every day')).toBe(true)
      expect(isValidExpression('every 1 day')).toBe(true)
      expect(isValidExpression('every 2 days')).toBe(true)
      expect(isValidExpression('every week')).toBe(true)
      expect(isValidExpression('every 1 week')).toBe(true)
      expect(isValidExpression('every 2 weeks')).toBe(true)
      expect(isValidExpression('every other week')).toBe(true)
    })

    it('accepts full and abbreviated weekday names', () => {
      expect(isValidExpression('every monday')).toBe(true)
      expect(isValidExpression('every mon')).toBe(true)
      expect(isValidExpression('every friday')).toBe(true)
      expect(isValidExpression('every fri')).toBe(true)
      expect(isValidExpression('every sunday')).toBe(true)
      expect(isValidExpression('every sun')).toBe(true)
    })

    it('accepts ordinal monthly expressions (1–28)', () => {
      expect(isValidExpression('every 1st')).toBe(true)
      expect(isValidExpression('every 2nd')).toBe(true)
      expect(isValidExpression('every 3rd')).toBe(true)
      expect(isValidExpression('every 15th')).toBe(true)
      expect(isValidExpression('every 28th')).toBe(true)
      expect(isValidExpression('every 15')).toBe(true)
    })

    it('accepts month/year interval expressions', () => {
      expect(isValidExpression('every month')).toBe(true)
      expect(isValidExpression('every 1 month')).toBe(true)
      expect(isValidExpression('every 2 months')).toBe(true)
      expect(isValidExpression('every year')).toBe(true)
      expect(isValidExpression('every 1 year')).toBe(true)
      expect(isValidExpression('every 2 years')).toBe(true)
    })

    it('accepts yearly specific dates with abbreviated and full month names', () => {
      expect(isValidExpression('every jan 1')).toBe(true)
      expect(isValidExpression('every january 1')).toBe(true)
      expect(isValidExpression('every dec 25')).toBe(true)
      expect(isValidExpression('every december 25')).toBe(true)
    })
  })

  describe('case insensitivity', () => {
    it('accepts mixed-case input', () => {
      expect(isValidExpression('Every Day')).toBe(true)
      expect(isValidExpression('Every Monday')).toBe(true)
      expect(isValidExpression('DAILY')).toBe(true)
      expect(isValidExpression('Every Jan 1')).toBe(true)
    })
  })

  describe('rejection', () => {
    it('rejects empty and whitespace', () => {
      expect(isValidExpression('')).toBe(false)
      expect(isValidExpression('  ')).toBe(false)
    })

    it('rejects unrecognised expressions', () => {
      expect(isValidExpression('every')).toBe(false)
      expect(isValidExpression('every notaday')).toBe(false)
      expect(isValidExpression('every 0 days')).toBe(false)
      expect(isValidExpression('every 0 months')).toBe(false)
      expect(isValidExpression('every 0 weeks')).toBe(false)
      expect(isValidExpression('every feb 30')).toBe(false)
    })

    it('rejects ordinal day > 28', () => {
      expect(isValidExpression('every 29th')).toBe(false)
      expect(isValidExpression('every 31st')).toBe(false)
      expect(isValidExpression('every 29')).toBe(false)
    })
  })
})

describe('nextDueDate — interval', () => {
  it('"daily" alias returns the next day', () => {
    expect(nextDueDate('daily', '2026-06-25')).toBe('2026-06-26')
  })

  it('"every day" returns the next day', () => {
    expect(nextDueDate('every day', '2026-06-25')).toBe('2026-06-26')
  })

  it('"every day" wraps month boundary', () => {
    expect(nextDueDate('every day', '2026-06-30')).toBe('2026-07-01')
  })

  it('"every 2 days" returns 2 days later', () => {
    expect(nextDueDate('every 2 days', '2026-06-25')).toBe('2026-06-27')
  })

  it('"every week" / "weekly" return 7 days later', () => {
    expect(nextDueDate('every week', '2026-06-25')).toBe('2026-07-02')
    expect(nextDueDate('weekly', '2026-06-25')).toBe('2026-07-02')
  })

  it('"every 2 weeks" / "fortnightly" / "every other week" return 14 days later', () => {
    expect(nextDueDate('every 2 weeks', '2026-06-25')).toBe('2026-07-09')
    expect(nextDueDate('fortnightly', '2026-06-25')).toBe('2026-07-09')
    expect(nextDueDate('every other week', '2026-06-25')).toBe('2026-07-09')
  })
})

describe('nextDueDate — weekday', () => {
  it('returns the next occurrence of the target weekday (full name)', () => {
    // 2026-06-25 is a Thursday; next Monday is 2026-06-29
    expect(nextDueDate('every monday', '2026-06-25')).toBe('2026-06-29')
  })

  it('returns the next occurrence of the target weekday (abbreviated name)', () => {
    expect(nextDueDate('every mon', '2026-06-25')).toBe('2026-06-29')
  })

  it('if completedAt is the target weekday, returns 7 days later', () => {
    // 2026-06-22 is a Monday
    expect(nextDueDate('every monday', '2026-06-22')).toBe('2026-06-29')
  })

  it('wraps year boundary', () => {
    // 2026-12-31 is a Thursday; next Monday is 2027-01-04
    expect(nextDueDate('every monday', '2026-12-31')).toBe('2027-01-04')
  })
})

describe('nextDueDate — ordinal monthly', () => {
  it('returns the next occurrence of that day in the current month', () => {
    expect(nextDueDate('every 15th', '2026-06-10')).toBe('2026-06-15')
    expect(nextDueDate('every 15', '2026-06-10')).toBe('2026-06-15')
  })

  it('advances to next month when day already passed', () => {
    expect(nextDueDate('every 1st', '2026-06-10')).toBe('2026-07-01')
  })

  it('advances to next month when completedAt is the target day', () => {
    expect(nextDueDate('every 15th', '2026-06-15')).toBe('2026-07-15')
  })

  it('wraps year boundary', () => {
    expect(nextDueDate('every 1st', '2026-12-10')).toBe('2027-01-01')
  })
})

describe('nextDueDate — monthly relative', () => {
  it('"every month" / "monthly" return the same day next month', () => {
    expect(nextDueDate('every month', '2026-06-25')).toBe('2026-07-25')
    expect(nextDueDate('monthly', '2026-06-25')).toBe('2026-07-25')
  })

  it('"every month" clamps to last day of month when needed', () => {
    expect(nextDueDate('every month', '2026-01-31')).toBe('2026-02-28')
  })

  it('"every month" wraps year boundary', () => {
    expect(nextDueDate('every month', '2026-12-15')).toBe('2027-01-15')
  })

  it('"every 2 months" advances by 2 calendar months', () => {
    expect(nextDueDate('every 2 months', '2026-06-25')).toBe('2026-08-25')
  })

  it('"quarterly" advances by 3 calendar months', () => {
    expect(nextDueDate('quarterly', '2026-06-25')).toBe('2026-09-25')
  })

  it('"every 3 months" advances across year boundary', () => {
    expect(nextDueDate('every 3 months', '2026-11-15')).toBe('2027-02-15')
  })
})

describe('nextDueDate — yearly specific', () => {
  it('returns the target date later in the same year', () => {
    expect(nextDueDate('every dec 25', '2026-06-25')).toBe('2026-12-25')
    expect(nextDueDate('every december 25', '2026-06-25')).toBe('2026-12-25')
  })

  it('advances to next year when target date already passed', () => {
    expect(nextDueDate('every jan 1', '2026-06-25')).toBe('2027-01-01')
    expect(nextDueDate('every january 1', '2026-06-25')).toBe('2027-01-01')
  })

  it('advances to next year when completedAt is the target date', () => {
    expect(nextDueDate('every jun 25', '2026-06-25')).toBe('2027-06-25')
  })
})

describe('nextDueDate — yearly relative', () => {
  it('"every year" / "yearly" / "annually" return the same date next year', () => {
    expect(nextDueDate('every year', '2026-06-25')).toBe('2027-06-25')
    expect(nextDueDate('yearly', '2026-06-25')).toBe('2027-06-25')
    expect(nextDueDate('annually', '2026-06-25')).toBe('2027-06-25')
  })

  it('"every year" clamps Feb 29 to Feb 28 in non-leap years', () => {
    expect(nextDueDate('every year', '2024-02-29')).toBe('2025-02-28')
  })

  it('"every 2 years" advances by 2 years', () => {
    expect(nextDueDate('every 2 years', '2026-06-25')).toBe('2028-06-25')
  })
})

describe('nextDueDate — errors', () => {
  it('returns null for invalid expression', () => {
    expect(nextDueDate('not-valid', '2026-06-25')).toBeNull()
    expect(nextDueDate('every notaday', '2026-06-25')).toBeNull()
  })
})
