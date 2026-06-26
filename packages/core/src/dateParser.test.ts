import { describe, it, expect } from 'vitest'
import { addDays, nextWeekday, parseDueDate, isValidExpression, nextDueDate } from './dateParser.js'

function nextN(expression: string, start: string, n = 5): string[] {
  const results: string[] = []
  let current = start
  for (let i = 0; i < n; i++) {
    const next = nextDueDate(expression, current)
    if (next === null) break
    results.push(next)
    current = next
  }
  return results
}

// 2026-06-25 is a Thursday (UTC day 4)
const TODAY = '2026-06-25'

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-06-25', 1)).toBe('2026-06-26')
    expect(addDays('2026-06-25', 7)).toBe('2026-07-02')
  })

  it('handles month and year rollovers', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('nextWeekday', () => {
  // 2026-06-25 is Thursday (4)
  it('returns the nearest future occurrence of a later weekday', () => {
    expect(nextWeekday(TODAY, 5)).toBe('2026-06-26') // Friday
    expect(nextWeekday(TODAY, 6)).toBe('2026-06-27') // Saturday
    expect(nextWeekday(TODAY, 0)).toBe('2026-06-28') // Sunday
    expect(nextWeekday(TODAY, 1)).toBe('2026-06-29') // Monday
  })

  it('returns the nearest future occurrence of an earlier weekday', () => {
    expect(nextWeekday(TODAY, 2)).toBe('2026-06-30') // Tuesday
    expect(nextWeekday(TODAY, 3)).toBe('2026-07-01') // Wednesday
  })

  it('returns 7 days ahead when today is already that weekday', () => {
    // 2026-06-29 is Monday (1)
    expect(nextWeekday('2026-06-29', 1)).toBe('2026-07-06')
  })
})

describe('parseDueDate', () => {
  it('returns null for empty input', () => {
    expect(parseDueDate('', TODAY)).toBeNull()
    expect(parseDueDate('   ', TODAY)).toBeNull()
  })

  it('returns null for unrecognized input', () => {
    expect(parseDueDate('blah', TODAY)).toBeNull()
    expect(parseDueDate('the day after tomorrow', TODAY)).toBeNull()
  })

  it('parses "today"', () => {
    expect(parseDueDate('today', TODAY)).toBe('2026-06-25')
    expect(parseDueDate('Today', TODAY)).toBe('2026-06-25')
    expect(parseDueDate('tod', TODAY)).toBe('2026-06-25')
  })

  it('parses "tomorrow"', () => {
    expect(parseDueDate('tomorrow', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('Tomorrow', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('tom', TODAY)).toBe('2026-06-26')
  })

  it('parses weekday names', () => {
    expect(parseDueDate('friday', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('saturday', TODAY)).toBe('2026-06-27')
    expect(parseDueDate('monday', TODAY)).toBe('2026-06-29')
  })

  it('parses abbreviated weekday names', () => {
    expect(parseDueDate('fri', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('sat', TODAY)).toBe('2026-06-27')
    expect(parseDueDate('mon', TODAY)).toBe('2026-06-29')
    expect(parseDueDate('tue', TODAY)).toBe('2026-06-30')
    expect(parseDueDate('wed', TODAY)).toBe('2026-07-01')
    expect(parseDueDate('thu', TODAY)).toBe('2026-07-02')
    expect(parseDueDate('sun', TODAY)).toBe('2026-06-28')
  })

  it('parses "next <weekday>"', () => {
    expect(parseDueDate('next friday', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('next saturday', TODAY)).toBe('2026-06-27')
    expect(parseDueDate('next monday', TODAY)).toBe('2026-06-29')
  })

  it('parses "next <abbreviated weekday>"', () => {
    expect(parseDueDate('next fri', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('next mon', TODAY)).toBe('2026-06-29')
  })

  it('returns 7 days when today matches the named weekday', () => {
    expect(parseDueDate('thursday', TODAY)).toBe('2026-07-02')
    expect(parseDueDate('next thursday', TODAY)).toBe('2026-07-02')
  })

  it('"this <weekday>" returns today when today matches, otherwise next occurrence', () => {
    expect(parseDueDate('this thursday', TODAY)).toBe('2026-06-25') // today
    expect(parseDueDate('this thu', TODAY)).toBe('2026-06-25') // today
    expect(parseDueDate('this friday', TODAY)).toBe('2026-06-26') // tomorrow
    expect(parseDueDate('this monday', TODAY)).toBe('2026-06-29') // next Mon
  })

  it('parses "in N days"', () => {
    expect(parseDueDate('in 3 days', TODAY)).toBe('2026-06-28')
    expect(parseDueDate('in 1 day', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('in 0 days', TODAY)).toBe('2026-06-25')
  })

  it('parses "next week" as Monday of next week', () => {
    // TODAY is Thursday 25 Jun — next Monday is 29 Jun
    expect(parseDueDate('next week', TODAY)).toBe('2026-06-29')
  })

  it('parses ISO date strings', () => {
    expect(parseDueDate('2026-12-25', TODAY)).toBe('2026-12-25')
    expect(parseDueDate('2027-01-01', TODAY)).toBe('2027-01-01')
    expect(parseDueDate('2026-1-3', TODAY)).toBe('2026-01-03')
    expect(parseDueDate('2026-12-1', TODAY)).toBe('2026-12-01')
    expect(parseDueDate('2027-1-1', TODAY)).toBe('2027-01-01')
  })

  it('parses a bare month name as the 1st of that month', () => {
    expect(parseDueDate('jul', TODAY)).toBe('2026-07-01')
    expect(parseDueDate('july', TODAY)).toBe('2026-07-01')
    expect(parseDueDate('dec', TODAY)).toBe('2026-12-01')
    expect(parseDueDate('jan', TODAY)).toBe('2027-01-01') // past in current year → next year
  })

  it('parses "mon DD" and "month DD"', () => {
    expect(parseDueDate('jul 4', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('july 4', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('dec 25', TODAY)).toBe('2026-12-25')
  })

  it('parses "mon DDth" and "DDth mon" with ordinal suffixes', () => {
    expect(parseDueDate('jul 4th', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('july 4th', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('dec 1st', TODAY)).toBe('2026-12-01')
    expect(parseDueDate('dec 2nd', TODAY)).toBe('2026-12-02')
    expect(parseDueDate('dec 3rd', TODAY)).toBe('2026-12-03')
    expect(parseDueDate('4th jul', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('4th july', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('1st jan', TODAY)).toBe('2027-01-01')
  })

  it('parses "DD mon" and "DD month"', () => {
    expect(parseDueDate('4 jul', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('4 july', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('25 dec', TODAY)).toBe('2026-12-25')
  })

  it('uses next year for past month+day', () => {
    expect(parseDueDate('jan 1', TODAY)).toBe('2027-01-01')
    expect(parseDueDate('1 jan', TODAY)).toBe('2027-01-01')
  })

  it('uses next year when month+day equals today', () => {
    expect(parseDueDate('jun 25', TODAY)).toBe('2027-06-25')
    expect(parseDueDate('25 jun', TODAY)).toBe('2027-06-25')
    expect(parseDueDate('june 25', TODAY)).toBe('2027-06-25')
  })

  it('returns null for invalid month+day', () => {
    expect(parseDueDate('feb 30', TODAY)).toBeNull()
    expect(parseDueDate('jan 32', TODAY)).toBeNull()
  })

  it('parses bare day numbers', () => {
    // Today is 25 Jun — day 26+ are still in June, day 25 and below go to July
    expect(parseDueDate('26', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('30', TODAY)).toBe('2026-06-30')
    expect(parseDueDate('12', TODAY)).toBe('2026-07-12')
    expect(parseDueDate('25', TODAY)).toBe('2026-07-25') // today's date → next month
    expect(parseDueDate('1', TODAY)).toBe('2026-07-01')
  })

  it('parses ordinal day numbers', () => {
    expect(parseDueDate('26th', TODAY)).toBe('2026-06-26')
    expect(parseDueDate('1st', TODAY)).toBe('2026-07-01')
    expect(parseDueDate('2nd', TODAY)).toBe('2026-07-02')
    expect(parseDueDate('3rd', TODAY)).toBe('2026-07-03')
    expect(parseDueDate('21st', TODAY)).toBe('2026-07-21')
    expect(parseDueDate('22nd', TODAY)).toBe('2026-07-22')
    expect(parseDueDate('23rd', TODAY)).toBe('2026-07-23')
  })

  it('skips to a later month if the day does not exist in the next candidate month', () => {
    // June has no 31st so next 31st from June 25 is July 31
    expect(parseDueDate('31', TODAY)).toBe('2026-07-31')
    // From Jan 25, the 30th is still in January
    expect(parseDueDate('30', '2026-01-25')).toBe('2026-01-30')
    // From Feb 10, no 30th in Feb → March 30
    expect(parseDueDate('30', '2026-02-10')).toBe('2026-03-30')
    expect(parseDueDate('31', '2026-02-10')).toBe('2026-03-31')
  })

  it('returns null for out-of-range day numbers', () => {
    expect(parseDueDate('0', TODAY)).toBeNull()
    expect(parseDueDate('32', TODAY)).toBeNull()
    expect(parseDueDate('0th', TODAY)).toBeNull()
    expect(parseDueDate('32nd', TODAY)).toBeNull()
  })

  it('parses UK numeric dates DD/MM/YY and DD/MM/YYYY', () => {
    expect(parseDueDate('12/1/26', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('1/12/26', TODAY)).toBe('2026-12-01')
    expect(parseDueDate('12/01/26', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('12/1/2026', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('25/12/26', TODAY)).toBe('2026-12-25')
  })

  it('parses UK numeric dates DD/MM without year', () => {
    // Jan 12 is in the past relative to TODAY (Jun 25 2026) → resolves to 2027
    expect(parseDueDate('12/1', TODAY)).toBe('2027-01-12')
    // Dec 25 is still in the future relative to TODAY → 2026
    expect(parseDueDate('25/12', TODAY)).toBe('2026-12-25')
  })

  it('returns null for invalid UK numeric dates', () => {
    expect(parseDueDate('32/1/26', TODAY)).toBeNull()
    expect(parseDueDate('12/13/26', TODAY)).toBeNull()
    expect(parseDueDate('0/1/26', TODAY)).toBeNull()
  })

  it('parses "DD Mon YY" and "DD Mon YYYY"', () => {
    expect(parseDueDate('12 jan 26', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('12 jan 2026', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('12 january 26', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('25 dec 26', TODAY)).toBe('2026-12-25')
    expect(parseDueDate('1 jan 27', TODAY)).toBe('2027-01-01')
  })

  it('parses "Mon DD YY" and "Mon DD YYYY"', () => {
    expect(parseDueDate('jan 12 26', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('jan 12 2026', TODAY)).toBe('2026-01-12')
    expect(parseDueDate('december 25 26', TODAY)).toBe('2026-12-25')
    expect(parseDueDate('jan 1 27', TODAY)).toBe('2027-01-01')
  })
})

// ── Recurrence ────────────────────────────────────────────────────────────────

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

    it('accepts ordinal suffix on day in month-day format', () => {
      expect(isValidExpression('every oct 19th')).toBe(true)
      expect(isValidExpression('ev mar 25th')).toBe(true)
      expect(isValidExpression('every jan 1st')).toBe(true)
    })

    it('accepts reversed day-month format', () => {
      expect(isValidExpression('every 3 jan')).toBe(true)
      expect(isValidExpression('ev 10th feb')).toBe(true)
      expect(isValidExpression('every 1 november')).toBe(true)
      expect(isValidExpression('ev 25th apr')).toBe(true)
    })

    it('accepts "every!" prefix (fixed-schedule variant, treated same as "every")', () => {
      expect(isValidExpression('every! week')).toBe(true)
      expect(isValidExpression('every! 2 weeks')).toBe(true)
      expect(isValidExpression('every! month')).toBe(true)
      expect(isValidExpression('every! day')).toBe(true)
      expect(isValidExpression('every! 14 days')).toBe(true)
    })

    it('accepts "every workday" / "every weekday" / "ev weekday"', () => {
      expect(isValidExpression('every workday')).toBe(true)
      expect(isValidExpression('every weekday')).toBe(true)
      expect(isValidExpression('ev weekday')).toBe(true)
    })

    it('accepts "every weekend"', () => {
      expect(isValidExpression('every weekend')).toBe(true)
      expect(isValidExpression('ev weekend')).toBe(true)
    })

    it('accepts Nth weekday of month', () => {
      expect(isValidExpression('every 1st monday')).toBe(true)
      expect(isValidExpression('ev 2nd mon')).toBe(true)
      expect(isValidExpression('every 5th wednesday')).toBe(true)
      expect(isValidExpression('every last thursday')).toBe(true)
      expect(isValidExpression('ev last fri')).toBe(true)
      expect(isValidExpression('ev third thur')).toBe(true)
      expect(isValidExpression('every first monday')).toBe(true)
      expect(isValidExpression('every second tuesday')).toBe(true)
      expect(isValidExpression('every fourth fri')).toBe(true)
      expect(isValidExpression('every fifth saturday')).toBe(true)
    })

    it('accepts Nth weekday of specific month (yearly)', () => {
      expect(isValidExpression('every 1st monday in october')).toBe(true)
      expect(isValidExpression('ev 2nd mon of jan')).toBe(true)
      expect(isValidExpression('every last thursday in november')).toBe(true)
      expect(isValidExpression('every third thursday in november')).toBe(true)
      expect(isValidExpression('ev second mon of jan')).toBe(true)
    })
  })

  describe('case insensitivity and shorthands', () => {
    it('accepts mixed-case input', () => {
      expect(isValidExpression('Every Day')).toBe(true)
      expect(isValidExpression('Every Monday')).toBe(true)
      expect(isValidExpression('DAILY')).toBe(true)
      expect(isValidExpression('Every Jan 1')).toBe(true)
    })

    it('"ev" is shorthand for "every"', () => {
      expect(isValidExpression('ev day')).toBe(true)
      expect(isValidExpression('ev monday')).toBe(true)
      expect(isValidExpression('ev 2 weeks')).toBe(true)
      expect(isValidExpression('ev jan 1')).toBe(true)
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
  it('"daily" alias advances daily', () => {
    expect(nextN('daily', '2026-06-25')).toEqual([
      '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30',
    ])
  })

  it('"every day" advances daily across month boundary', () => {
    expect(nextN('every day', '2026-06-28')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03',
    ])
  })

  it('"every 2 days" advances every 2 days', () => {
    expect(nextN('every 2 days', '2026-06-25')).toEqual([
      '2026-06-27', '2026-06-29', '2026-07-01', '2026-07-03', '2026-07-05',
    ])
  })

  it('"every week" / "weekly" advance by 7 days', () => {
    expect(nextN('every week', '2026-06-25')).toEqual([
      '2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30',
    ])
    expect(nextN('weekly', '2026-06-25')).toEqual([
      '2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30',
    ])
  })

  it('"every 2 weeks" / "fortnightly" / "every other week" advance by 14 days', () => {
    expect(nextN('every 2 weeks', '2026-06-25')).toEqual([
      '2026-07-09', '2026-07-23', '2026-08-06', '2026-08-20', '2026-09-03',
    ])
    expect(nextN('fortnightly', '2026-06-25')).toEqual(nextN('every 2 weeks', '2026-06-25'))
    expect(nextN('every other week', '2026-06-25')).toEqual(nextN('every 2 weeks', '2026-06-25'))
  })
})

describe('nextDueDate — weekday', () => {
  it('returns the next 5 occurrences of monday (full name)', () => {
    // 2026-06-25 is Thursday; next Monday is 2026-06-29
    expect(nextN('every monday', '2026-06-25')).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    ])
  })

  it('abbreviated name produces same results as full name', () => {
    expect(nextN('every mon', '2026-06-25')).toEqual(nextN('every monday', '2026-06-25'))
  })

  it('"ev mon" means every monday, not every month', () => {
    expect(nextN('ev mon', '2026-06-25')).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    ])
  })

  it('if completedAt is the target weekday, skips to next week', () => {
    // 2026-06-22 is a Monday
    expect(nextN('every monday', '2026-06-22')).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    ])
  })

  it('wraps year boundary', () => {
    // 2026-12-31 is Thursday; next Monday is 2027-01-04
    expect(nextN('every monday', '2026-12-31', 3)).toEqual([
      '2027-01-04', '2027-01-11', '2027-01-18',
    ])
  })
})

describe('nextDueDate — ordinal monthly', () => {
  it('returns the next 5 occurrences of the 15th', () => {
    expect(nextN('every 15th', '2026-06-10')).toEqual([
      '2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15',
    ])
  })

  it('when completedAt is the 15th, starts from next month', () => {
    expect(nextN('every 15th', '2026-06-15')).toEqual([
      '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15',
    ])
  })

  it('bare number without suffix is equivalent', () => {
    expect(nextN('every 15', '2026-06-10')).toEqual(nextN('every 15th', '2026-06-10'))
    expect(nextN('ev 5', '2026-06-10')).toEqual(nextN('every 5th', '2026-06-10'))
  })

  it('wraps year boundary', () => {
    expect(nextN('every 1st', '2026-11-10', 3)).toEqual([
      '2026-12-01', '2027-01-01', '2027-02-01',
    ])
  })
})

describe('nextDueDate — monthly relative', () => {
  it('"every month" / "monthly" advance by one calendar month', () => {
    expect(nextN('every month', '2026-06-25')).toEqual([
      '2026-07-25', '2026-08-25', '2026-09-25', '2026-10-25', '2026-11-25',
    ])
    expect(nextN('monthly', '2026-06-25')).toEqual(nextN('every month', '2026-06-25'))
  })

  it('clamps to last day of month when needed', () => {
    expect(nextN('every month', '2026-01-31', 3)).toEqual([
      '2026-02-28', '2026-03-28', '2026-04-28',
    ])
  })

  it('wraps year boundary', () => {
    expect(nextN('every month', '2026-11-15', 3)).toEqual([
      '2026-12-15', '2027-01-15', '2027-02-15',
    ])
  })

  it('"every 2 months" advances by 2 calendar months', () => {
    expect(nextN('every 2 months', '2026-06-25')).toEqual([
      '2026-08-25', '2026-10-25', '2026-12-25', '2027-02-25', '2027-04-25',
    ])
  })

  it('"quarterly" advances by 3 calendar months', () => {
    expect(nextN('quarterly', '2026-01-15', 3)).toEqual([
      '2026-04-15', '2026-07-15', '2026-10-15',
    ])
  })
})

describe('nextDueDate — yearly specific', () => {
  it('returns the next 3 occurrences of dec 25', () => {
    expect(nextN('every dec 25', '2026-06-25', 3)).toEqual([
      '2026-12-25', '2027-12-25', '2028-12-25',
    ])
  })

  it('full month name is equivalent to abbreviated', () => {
    expect(nextN('every december 25', '2026-06-25', 3)).toEqual(nextN('every dec 25', '2026-06-25', 3))
  })

  it('advances to next year when target date already passed', () => {
    expect(nextN('every jan 1', '2026-06-25', 3)).toEqual([
      '2027-01-01', '2028-01-01', '2029-01-01',
    ])
  })

  it('when completedAt is the target date, advances to next year', () => {
    expect(nextN('every jun 25', '2026-06-25', 3)).toEqual([
      '2027-06-25', '2028-06-25', '2029-06-25',
    ])
  })

  it('"every oct 19th" computes correctly', () => {
    expect(nextN('every oct 19th', '2026-06-25', 3)).toEqual([
      '2026-10-19', '2027-10-19', '2028-10-19',
    ])
  })

  it('"every 3 jan" (reversed day-month) computes correctly', () => {
    expect(nextN('every 3 jan', '2026-06-25', 3)).toEqual([
      '2027-01-03', '2028-01-03', '2029-01-03',
    ])
  })

  it('"ev 10th feb" (reversed day-month with ordinal) computes correctly', () => {
    expect(nextN('ev 10th feb', '2026-06-25', 3)).toEqual([
      '2027-02-10', '2028-02-10', '2029-02-10',
    ])
  })
})

describe('nextDueDate — yearly relative', () => {
  it('"every year" / "yearly" / "annually" advance by one year', () => {
    expect(nextN('every year', '2026-06-25', 3)).toEqual([
      '2027-06-25', '2028-06-25', '2029-06-25',
    ])
    expect(nextN('yearly', '2026-06-25', 3)).toEqual(nextN('every year', '2026-06-25', 3))
    expect(nextN('annually', '2026-06-25', 3)).toEqual(nextN('every year', '2026-06-25', 3))
  })

  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    expect(nextN('every year', '2024-02-29', 3)).toEqual([
      '2025-02-28', '2026-02-28', '2027-02-28',
    ])
  })

  it('"every 2 years" advances by 2 years', () => {
    expect(nextN('every 2 years', '2026-06-25', 3)).toEqual([
      '2028-06-25', '2030-06-25', '2032-06-25',
    ])
  })
})

describe('nextDueDate — workday', () => {
  it('"every workday" skips weekends', () => {
    // 2026-06-25 is Thursday; next workdays: Fri, Mon, Tue, Wed, Thu
    expect(nextN('every workday', '2026-06-25')).toEqual([
      '2026-06-26', '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
    ])
  })

  it('"every weekday" is equivalent to "every workday"', () => {
    expect(nextN('every weekday', '2026-06-25')).toEqual(nextN('every workday', '2026-06-25'))
  })

  it('"ev weekday" is equivalent to "every workday"', () => {
    expect(nextN('ev weekday', '2026-06-25')).toEqual(nextN('every workday', '2026-06-25'))
  })

  it('skips weekend when completedAt is Friday', () => {
    // 2026-06-26 is Friday; next workday is Monday 2026-06-29
    expect(nextN('every workday', '2026-06-26', 1)).toEqual(['2026-06-29'])
  })
})

describe('nextDueDate — every! prefix', () => {
  it('"every! week" behaves the same as "every week"', () => {
    expect(nextN('every! week', '2026-06-25')).toEqual(nextN('every week', '2026-06-25'))
  })

  it('"every! 2 months" behaves the same as "every 2 months"', () => {
    expect(nextN('every! 2 months', '2026-06-25')).toEqual(nextN('every 2 months', '2026-06-25'))
  })
})

describe('nextDueDate — weekend', () => {
  it('alternates Sat/Sun, starting from the next weekend day', () => {
    // 2026-06-25 is Thu; Sat Jun 27, Sun Jun 28, Sat Jul 4, Sun Jul 5, Sat Jul 11
    expect(nextN('every weekend', '2026-06-25')).toEqual([
      '2026-06-27', '2026-06-28', '2026-07-04', '2026-07-05', '2026-07-11',
    ])
  })

  it('completing on Saturday returns Sunday', () => {
    expect(nextN('every weekend', '2026-06-27', 1)).toEqual(['2026-06-28'])
  })

  it('completing on Sunday returns next Saturday', () => {
    expect(nextN('every weekend', '2026-06-28', 1)).toEqual(['2026-07-04'])
  })
})

describe('nextDueDate — Nth weekday of month', () => {
  it('"every 1st monday" returns the first Monday of each month', () => {
    // 1st Mon of Jul=Jul 6, Aug=Aug 3, Sep=Sep 7
    expect(nextN('every 1st monday', '2026-06-25', 3)).toEqual([
      '2026-07-06', '2026-08-03', '2026-09-07',
    ])
  })

  it('abbreviated form is equivalent', () => {
    expect(nextN('ev 2nd mon', '2026-06-25', 3)).toEqual(nextN('every 2nd monday', '2026-06-25', 3))
  })

  it('"every last thursday" returns the last Thursday of each month', () => {
    // Last Thu Jun=Jun 25 (already past), Jul=Jul 30, Aug=Aug 27, Sep=Sep 24
    expect(nextN('every last thursday', '2026-06-25', 3)).toEqual([
      '2026-07-30', '2026-08-27', '2026-09-24',
    ])
  })

  it('when completedAt equals the target, skips to next month', () => {
    // 1st Mon of Jul is Jul 6; completing on Jul 6 → next is Aug 3
    expect(nextN('every 1st monday', '2026-07-06', 1)).toEqual(['2026-08-03'])
  })

  it('falls back to the last occurrence in months with no 5th', () => {
    // Jun has no 5th Friday → falls back to Jun 26 (last Fri of Jun)
    // Jul has a 5th Fri (Jul 31); Aug has none → falls back to Aug 28 (last Fri of Aug)
    expect(nextN('every 5th friday', '2026-06-25', 3)).toEqual([
      '2026-06-26', '2026-07-31', '2026-08-28',
    ])
  })

  it('uses last Wednesday when a month has no 5th Wednesday', () => {
    // Jul 2026 has 5th Wed (Jul 29); Aug has none → falls back to Aug 26 (last Wed of Aug)
    expect(nextN('every 5th wednesday', '2026-06-25', 2)).toEqual([
      '2026-07-29', '2026-08-26',
    ])
  })
})

describe('nextDueDate — Nth weekday of year', () => {
  it('"every 1st monday in october" returns first Monday of October each year', () => {
    expect(nextN('every 1st monday in october', '2026-06-25', 3)).toEqual([
      '2026-10-05', '2027-10-04', '2028-10-02',
    ])
  })

  it('"ev 2nd mon of jan" returns the second Monday of January each year', () => {
    expect(nextN('ev 2nd mon of jan', '2026-06-25', 3)).toEqual([
      '2027-01-11', '2028-01-10', '2029-01-08',
    ])
  })

  it('"every last thursday in november" returns the last Thursday of November each year', () => {
    expect(nextN('every last thursday in november', '2026-06-25', 3)).toEqual([
      '2026-11-26', '2027-11-25', '2028-11-30',
    ])
  })
})

describe('nextDueDate — errors', () => {
  it('returns null for invalid expression', () => {
    expect(nextDueDate('not-valid', '2026-06-25')).toBeNull()
    expect(nextDueDate('every notaday', '2026-06-25')).toBeNull()
  })
})

// ── parseDueDate year-boundary cases ─────────────────────────────────────────

// 2026-12-28 is a Monday
const TODAY_DEC = '2026-12-28'

describe('parseDueDate — year-boundary cases', () => {
  it('bare day numbers advance into next year from late December', () => {
    expect(parseDueDate('31', TODAY_DEC)).toBe('2026-12-31')
    expect(parseDueDate('5', TODAY_DEC)).toBe('2027-01-05')
    expect(parseDueDate('1', TODAY_DEC)).toBe('2027-01-01')
  })

  it('weekday names cross into next year from late December', () => {
    // Dec 28 is Monday; Friday is 4 days ahead → Jan 1 2027
    expect(parseDueDate('friday', TODAY_DEC)).toBe('2027-01-01')
    // Sunday is 6 days ahead → Jan 3 2027
    expect(parseDueDate('sunday', TODAY_DEC)).toBe('2027-01-03')
  })

  it('"next week" and "in N days" cross into next year', () => {
    // Dec 28 is Monday — next Monday is Jan 4
    expect(parseDueDate('next week', TODAY_DEC)).toBe('2027-01-04')
    expect(parseDueDate('in 7 days', TODAY_DEC)).toBe('2027-01-04')
    expect(parseDueDate('in 4 days', TODAY_DEC)).toBe('2027-01-01')
  })

  it('month names advance to next year when the month has already passed', () => {
    expect(parseDueDate('jan', TODAY_DEC)).toBe('2027-01-01')
    expect(parseDueDate('june', TODAY_DEC)).toBe('2027-06-01')
  })

  it('"DD mon" and "mon DD" advance to next year from late December', () => {
    expect(parseDueDate('15 jan', TODAY_DEC)).toBe('2027-01-15')
    expect(parseDueDate('jan 15', TODAY_DEC)).toBe('2027-01-15')
    expect(parseDueDate('15 jan 27', TODAY_DEC)).toBe('2027-01-15')
  })

  it('UK numeric DD/MM without year advances to next year from late December', () => {
    expect(parseDueDate('15/1', TODAY_DEC)).toBe('2027-01-15')
    expect(parseDueDate('15/6', TODAY_DEC)).toBe('2027-06-15')
    expect(parseDueDate('31/12', TODAY_DEC)).toBe('2026-12-31')
  })
})
