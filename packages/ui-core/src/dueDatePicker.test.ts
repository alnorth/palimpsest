import { describe, it, expect } from 'vitest'
import { addDays, nextWeekday, parseDueDate } from './dueDatePicker.js'

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
