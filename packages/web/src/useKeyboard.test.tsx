// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React, { useState } from 'react'
import { useKeyboard } from './useKeyboard.js'
import type { AppStateResult } from 'palimpsest-ui-core'
import type { ViewModel } from 'palimpsest-ui-core'
import { INITIAL_UI_STATE } from 'palimpsest-ui-core'
import { createEmptyState, buildStateFromConfig } from 'palimpsest'
import type { SphereId } from 'palimpsest'

const SPHERE_ID = 'sph1' as SphereId
const projState = { ...createEmptyState(), ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]) }

function makeAppState(overrides: Partial<AppStateResult> = {}): AppStateResult {
  const base: ViewModel = {
    view: 'dashboard',
    mode: 'list',
    selected: 0,
    activeTask: undefined,
    activeProject: undefined,
    activeSphere: { id: SPHERE_ID, name: 'Work' },
    agendas: [],
    contexts: [],
    spheres: [{ id: SPHERE_ID, name: 'Work' }],
    projectStats: { hasNext: new Set(), taskCount: new Map() },
    listItems: { view: 'dashboard', items: [] },
    listLength: 0,
    currentTask: undefined,
    subtitle: 'Work',
    searchQuery: '',
    canGoBack: false,
    showCompleted: false,
    showArchived: false,
    tasks: [],
    dashboardTasks: [],
    projects: [],
    projectTasks: [],
  }
  return {
    ...base,
    projState,
    commands: {},
    dispatch: vi.fn(),
    activate: vi.fn(),
    syncState: { health: 'idle', unsyncedCount: 0, pendingConflicts: [], lastError: undefined },
    ...overrides,
  }
}

function TestHarness({ appState }: { appState: AppStateResult }) {
  const [formValue, setFormValue] = useState('')
  useKeyboard(appState, formValue, setFormValue)
  return <div data-testid="form-value">{formValue}</div>
}


describe('useKeyboard', () => {
  afterEach(() => { cleanup() })

  it('dispatches go-back on Escape in list mode', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, canGoBack: true })
    const { container } = render(<TestHarness appState={appState} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'go-back' })
  })

  it('dispatches set-mode list on Escape when not in list mode', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, mode: 'adding' })
    render(<TestHarness appState={appState} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-mode', mode: 'list' })
  })

  it('dispatches navigate selected-1 on ArrowUp', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, selected: 2, listLength: 5 })
    render(<TestHarness appState={appState} />)
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-nav', patch: { selected: 1 } })
  })

  it('dispatches navigate selected+1 on ArrowDown', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, selected: 2, listLength: 5 })
    render(<TestHarness appState={appState} />)
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-nav', patch: { selected: 3 } })
  })

  it('does not fire navigation when an input element is focused', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, selected: 2, listLength: 5, activate: vi.fn() })
    render(<TestHarness appState={appState} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(dispatch).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('Escape cancels mode even when an input element is focused', () => {
    const dispatch = vi.fn()
    const appState = makeAppState({ dispatch, mode: 'adding', activate: vi.fn() })
    render(<TestHarness appState={appState} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-mode', mode: 'list' })
    document.body.removeChild(input)
  })
})
