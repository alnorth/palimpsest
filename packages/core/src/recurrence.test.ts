import { describe, it, expect } from 'vitest'
import { isValidExpression, nextDueDate } from './recurrence.js'

describe('isValidExpression', () => {
  it('accepts valid expressions', () => {
    expect(isValidExpression('daily')).toBe(true)
    expect(isValidExpression('weekly:monday')).toBe(true)
    expect(isValidExpression('weekly:friday')).toBe(true)
    expect(isValidExpression('monthly:1')).toBe(true)
    expect(isValidExpression('monthly:28')).toBe(true)
    expect(isValidExpression('yearly:jan-1')).toBe(true)
    expect(isValidExpression('yearly:dec-25')).toBe(true)
  })

  it('rejects invalid expressions', () => {
    expect(isValidExpression('')).toBe(false)
    expect(isValidExpression('weekly')).toBe(false)
    expect(isValidExpression('weekly:notaday')).toBe(false)
    expect(isValidExpression('monthly:0')).toBe(false)
    expect(isValidExpression('monthly:29')).toBe(false)
    expect(isValidExpression('yearly:nope-1')).toBe(false)
    expect(isValidExpression('yearly:jan-0')).toBe(false)
    expect(isValidExpression('every day')).toBe(false)
  })
})

describe('nextDueDate', () => {
  it('daily: returns the next day', () => {
    expect(nextDueDate('daily', '2026-06-25')).toBe('2026-06-26')
  })

  it('daily: wraps month boundary', () => {
    expect(nextDueDate('daily', '2026-06-30')).toBe('2026-07-01')
  })

  it('weekly: returns the correct day of week', () => {
    // 2026-06-25 is a Thursday; next Monday is 2026-06-29
    expect(nextDueDate('weekly:monday', '2026-06-25')).toBe('2026-06-29')
  })

  it('weekly: if today is the target day, returns 7 days later', () => {
    // 2026-06-22 is a Monday; next Monday should be 2026-06-29
    expect(nextDueDate('weekly:monday', '2026-06-22')).toBe('2026-06-29')
  })

  it('weekly: wraps year boundary', () => {
    // 2026-12-31 is a Thursday; next Monday is 2027-01-04
    expect(nextDueDate('weekly:monday', '2026-12-31')).toBe('2027-01-04')
  })

  it('monthly: returns next occurrence of day in month', () => {
    // completedAt on the 10th, next 15th is in the same month
    expect(nextDueDate('monthly:15', '2026-06-10')).toBe('2026-06-15')
  })

  it('monthly: wraps to next month when day already passed', () => {
    expect(nextDueDate('monthly:1', '2026-06-10')).toBe('2026-07-01')
  })

  it('monthly: wraps year boundary', () => {
    expect(nextDueDate('monthly:1', '2026-12-10')).toBe('2027-01-01')
  })

  it('yearly: returns next occurrence', () => {
    expect(nextDueDate('yearly:jan-1', '2026-06-25')).toBe('2027-01-01')
  })

  it('yearly: if occurrence is later this year, returns it', () => {
    expect(nextDueDate('yearly:dec-25', '2026-06-25')).toBe('2026-12-25')
  })

  it('returns null for invalid expression', () => {
    expect(nextDueDate('not-valid', '2026-06-25')).toBeNull()
  })
})
