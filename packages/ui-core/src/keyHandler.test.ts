import { describe, it, expect } from 'vitest'
import { resolveKeyAction } from './keyHandler.js'

describe('resolveKeyAction - Escape', () => {
  it('clears formValue when non-empty', () => {
    expect(resolveKeyAction('Escape', { type: 'adding', formValue: 'hello' }, {}))
      .toEqual({ type: 'update-mode', formValue: '' })
  })

  it('exits mode when formValue is empty', () => {
    expect(resolveKeyAction('Escape', { type: 'adding', formValue: '' }, {}))
      .toEqual({ type: 'exit-mode' })
  })

  it('clears searchQuery when non-empty and no mode', () => {
    expect(resolveKeyAction('Escape', undefined, {}, 'my project'))
      .toEqual({ type: 'update-nav', patch: { searchQuery: '', selected: 0 } })
  })

  it('clears searchQuery when non-empty even in a mode with empty formValue', () => {
    expect(resolveKeyAction('Escape', { type: 'adding', formValue: '' }, {}, 'query'))
      .toEqual({ type: 'update-nav', patch: { searchQuery: '', selected: 0 } })
  })

  it('goes back when no mode and no searchQuery', () => {
    expect(resolveKeyAction('Escape', undefined, {})).toEqual({ type: 'go-back' })
  })
})
