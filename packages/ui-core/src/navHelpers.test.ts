import { describe, it, expect } from 'vitest'
import { indexAfterAppend, indexAfterRemove } from './navHelpers.js'

describe('indexAfterAppend', () => {
  it('returns 0 for empty list (new item is at index 0)', () => {
    expect(indexAfterAppend([])).toBe(0)
  })

  it('returns old length (= new last index)', () => {
    expect(indexAfterAppend([1, 2, 3])).toBe(3)
  })
})

describe('indexAfterRemove', () => {
  it('keeps selected when it is below the new max', () => {
    expect(indexAfterRemove([1, 2, 3, 4, 5], 2)).toBe(2)
  })

  it('clamps selected down when it was the last item', () => {
    expect(indexAfterRemove([1, 2, 3], 2)).toBe(1)
  })

  it('clamps to 0 when the list had exactly one item', () => {
    expect(indexAfterRemove([1], 0)).toBe(0)
  })

  it('clamps to 0 when the list is now empty', () => {
    expect(indexAfterRemove([], 0)).toBe(0)
  })
})
