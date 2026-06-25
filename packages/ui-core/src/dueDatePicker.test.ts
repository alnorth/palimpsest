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

  it('parses "in N days"', () => {
    expect(parseDueDate('in 3 days', TODAY)).toBe('2026-06-28')
    expect(parseDueDate('in 1 day', TODAY)).toBe('2026-06-26')
  })

  it('parses "next week"', () => {
    expect(parseDueDate('next week', TODAY)).toBe('2026-07-02')
  })

  it('parses ISO date strings', () => {
    expect(parseDueDate('2026-12-25', TODAY)).toBe('2026-12-25')
    expect(parseDueDate('2027-01-01', TODAY)).toBe('2027-01-01')
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

  it('parses "DD mon" and "DD month"', () => {
    expect(parseDueDate('4 jul', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('4 july', TODAY)).toBe('2026-07-04')
    expect(parseDueDate('25 dec', TODAY)).toBe('2026-12-25')
  })

  it('uses next year for past month+day', () => {
    expect(parseDueDate('jan 1', TODAY)).toBe('2027-01-01')
    expect(parseDueDate('1 jan', TODAY)).toBe('2027-01-01')
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
})
