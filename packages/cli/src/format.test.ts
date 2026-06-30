import { describe, test, expect } from 'vitest'
import { formatDate } from './format.js'

describe('formatDate', () => {
  test('formats a mid-year date', () => {
    expect(formatDate('2026-06-30T12:00:00.000Z')).toBe('30 Jun')
  })

  test('formats a January date', () => {
    expect(formatDate('2026-01-01T12:00:00.000Z')).toBe('1 Jan')
  })

  test('formats a December date', () => {
    expect(formatDate('2026-12-25T12:00:00.000Z')).toBe('25 Dec')
  })
})
