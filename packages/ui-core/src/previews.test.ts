import { describe, test, expect } from 'vitest'
import { formatDateWithDay, getDueDatePreview, getRecurrencePreview } from './previews.js'

describe('formatDateWithDay', () => {
  test('formats a known date correctly', () => {
    expect(formatDateWithDay('2026-06-30')).toBe('Tue 30 Jun 2026')
  })

  test('formats a date at the start of the year', () => {
    expect(formatDateWithDay('2026-01-01')).toBe('Thu 1 Jan 2026')
  })

  test('formats a date in December', () => {
    expect(formatDateWithDay('2026-12-25')).toBe('Fri 25 Dec 2026')
  })
})

describe('getDueDatePreview', () => {
  const TODAY = '2026-06-30'

  test('returns undefined for empty input', () => {
    expect(getDueDatePreview('', TODAY)).toBeUndefined()
  })

  test('returns undefined for whitespace-only input', () => {
    expect(getDueDatePreview('   ', TODAY)).toBeUndefined()
  })

  test('returns ok preview for "tomorrow"', () => {
    const result = getDueDatePreview('tomorrow', TODAY)
    expect(result).toEqual({ ok: true, text: 'Wed 1 Jul 2026' })
  })

  test('returns ok preview for an ISO date', () => {
    const result = getDueDatePreview('2026-12-25', TODAY)
    expect(result).toEqual({ ok: true, text: 'Fri 25 Dec 2026' })
  })

  test('returns ok:false with message for an unparseable string', () => {
    const result = getDueDatePreview('not a date', TODAY)
    expect(result?.ok).toBe(false)
    expect(result?.text).toContain("Can't parse")
  })
})

describe('getRecurrencePreview', () => {
  const TODAY = '2026-06-30'

  test('returns undefined for empty input', () => {
    expect(getRecurrencePreview('', TODAY)).toBeUndefined()
  })

  test('returns undefined for whitespace-only input', () => {
    expect(getRecurrencePreview('   ', TODAY)).toBeUndefined()
  })

  test('returns ok:false for an invalid expression', () => {
    const result = getRecurrencePreview('not valid', TODAY)
    expect(result).toEqual({ ok: false, text: 'Invalid expression' })
  })

  test('returns ok:true with 3 formatted dates for "weekly"', () => {
    const result = getRecurrencePreview('weekly', TODAY)
    expect(result?.ok).toBe(true)
    const parts = result?.text.split(' · ')
    expect(parts).toHaveLength(3)
    expect(parts?.[0]).toBe('Tue 7 Jul 2026')
    expect(parts?.[1]).toBe('Tue 14 Jul 2026')
    expect(parts?.[2]).toBe('Tue 21 Jul 2026')
  })

  test('returns ok:true for "monthly"', () => {
    const result = getRecurrencePreview('monthly', TODAY)
    expect(result?.ok).toBe(true)
    expect(result?.text).toContain('Jul')
  })
})
