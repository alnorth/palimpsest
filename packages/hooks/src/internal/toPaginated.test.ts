import { describe, test, expect } from 'vitest'
import { toPaginated } from './toPaginated'

describe('toPaginated', () => {
  test('extracts items/total/truncated from the raw result under the given key', () => {
    const raw = { spheres: [{ id: '1' }], total: 1, truncated: false }
    expect(toPaginated(raw, 'spheres')).toEqual({ items: [{ id: '1' }], total: 1, truncated: false })
  })

  test('defaults to an empty Paginated when raw is undefined', () => {
    expect(toPaginated(undefined, 'spheres')).toEqual({ items: [], total: 0, truncated: false })
  })

  test('defaults each field independently when present but missing from raw', () => {
    expect(toPaginated({}, 'spheres')).toEqual({ items: [], total: 0, truncated: false })
  })

  test('truncated: true passes through rather than being defaulted away', () => {
    const raw = { tasks: [], total: 5, truncated: true }
    expect(toPaginated(raw, 'tasks')).toEqual({ items: [], total: 5, truncated: true })
  })
})
