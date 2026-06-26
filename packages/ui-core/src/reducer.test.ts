import { describe, it, expect } from 'vitest'
import { uiReducer } from './reducer.js'
import { INITIAL_UI_STATE, INITIAL_NAV } from './types.js'
import type { NavState } from './types.js'
import type { SphereId } from 'palimpsest'

const PROJECT_NAV: NavState = { ...INITIAL_NAV, view: 'projects' }

describe('navigate', () => {
  it('pushes a new nav state onto the stack', () => {
    const result = uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    expect(result.navStack).toHaveLength(2)
    expect(result.navStack[1]).toEqual(PROJECT_NAV)
  })

  it('does not mutate the original state', () => {
    uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    expect(INITIAL_UI_STATE.navStack).toHaveLength(1)
  })
})

describe('set-nav', () => {
  it('replaces the nav stack with a single entry', () => {
    const withTwo = uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    const result = uiReducer(withTwo, { type: 'set-nav', navState: { ...INITIAL_NAV, view: 'projects' } })
    expect(result.navStack).toHaveLength(1)
    expect(result.navStack[0]?.view).toBe('projects')
  })
})

describe('go-back', () => {
  it('pops the top nav state from the stack', () => {
    const withTwo = uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    const result = uiReducer(withTwo, { type: 'go-back' })
    expect(result.navStack).toHaveLength(1)
    expect(result.navStack[0]?.view).toBe('dashboard')
  })

  it('does nothing if already at the root', () => {
    const result = uiReducer(INITIAL_UI_STATE, { type: 'go-back' })
    expect(result.navStack).toHaveLength(1)
  })
})

describe('update-nav', () => {
  it('patches the current nav state in place', () => {
    const result = uiReducer(INITIAL_UI_STATE, { type: 'update-nav', patch: { selected: 5 } })
    const nav = result.navStack[0]
    expect(nav !== undefined && 'selected' in nav ? nav.selected : undefined).toBe(5)
    expect(result.navStack).toHaveLength(1)
  })

  it('patches the top nav state when multiple are on the stack', () => {
    const withTwo = uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    const result = uiReducer(withTwo, { type: 'update-nav', patch: { selected: 3 } })
    const top = result.navStack[1]
    const bottom = result.navStack[0]
    expect(top !== undefined && 'selected' in top ? top.selected : undefined).toBe(3)
    expect(bottom !== undefined && 'selected' in bottom ? bottom.selected : undefined).toBe(0)
  })
})

describe('set-mode', () => {
  it('changes the mode', () => {
    const result = uiReducer(INITIAL_UI_STATE, { type: 'set-mode', mode: 'adding' })
    expect(result.mode).toBe('adding')
  })

  it('does not affect the nav stack', () => {
    const result = uiReducer(INITIAL_UI_STATE, { type: 'set-mode', mode: 'adding' })
    expect(result.navStack).toHaveLength(1)
  })
})

describe('set-sphere', () => {
  it('sets the active sphere id', () => {
    const sphereId = 'sphere1' as SphereId
    const result = uiReducer(INITIAL_UI_STATE, { type: 'set-sphere', sphereId })
    expect(result.currentSphereId).toBe(sphereId)
  })

  it('resets the nav stack to a single initial nav entry', () => {
    const withTwo = uiReducer(INITIAL_UI_STATE, { type: 'navigate', navState: PROJECT_NAV })
    const result = uiReducer(withTwo, { type: 'set-sphere', sphereId: 'sphere1' as SphereId })
    expect(result.navStack).toHaveLength(1)
    expect(result.navStack[0]?.view).toBe('dashboard')
  })
})


