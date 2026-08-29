import { describe, it, expect } from 'vitest'
import { resolvePatched, CLEAR } from './events'

describe('resolvePatched', () => {
  it('patched value present → that value', () => {
    expect(resolvePatched('current', 'patched')).toBe('patched')
  })

  it('patched undefined (unchanged) → current value', () => {
    expect(resolvePatched('current', undefined)).toBe('current')
  })

  it('patched CLEAR → undefined, regardless of current value', () => {
    expect(resolvePatched('current', CLEAR)).toBeUndefined()
  })

  it('no current value, patched undefined → undefined', () => {
    expect(resolvePatched(undefined, undefined)).toBeUndefined()
  })
})
