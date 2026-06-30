import { describe, it, test, expect, vi } from 'vitest'
import { resolveKeyAction, handleKey } from './keyHandler.js'
import type { KeyEventContext } from './keyHandler.js'
import type { Command, CommandId, Action } from './types.js'
import type { ListItems } from './viewModel.js'

const MAIN_LIST: ListItems = {
  view: 'dashboard',
  groups: [],
  items: [],
  emptyMessage: '',
  selectedItem: undefined,
}

const SHORTCUT_PICKER: ListItems = {
  view: 'picking-view',
  groups: [],
  items: [
    { label: 'Dashboard', value: 'dashboard' as const, key: 'd' },
    { label: 'Tasks', value: 'tasks' as const, key: 't' },
  ],
  selectedItem: undefined,
}

const PROJECT_PICKER: ListItems = {
  view: 'picking-project-for-task',
  groups: [],
  items: [],
  selectedItem: undefined,
}

const ADD_COMMAND: Command = {
  id: 'add-task' as CommandId,
  label: 'Add task',
  group: 'create',
  key: 'q',
  action: { type: 'set-mode', mode: { type: 'adding', formValue: '' } },
}

function makeCtx(overrides: Partial<KeyEventContext> = {}): KeyEventContext {
  return {
    mode: undefined,
    listItems: MAIN_LIST,
    commands: {},
    searchQuery: '',
    dispatch: vi.fn(),
    activate: vi.fn(),
    activateSelected: vi.fn(),
    ...overrides,
  }
}

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

describe('resolveKeyAction - non-Escape', () => {
  test('mode set → returns null for any non-Escape key', () => {
    expect(resolveKeyAction('ArrowUp', { type: 'adding', formValue: '' }, {})).toBeNull()
    expect(resolveKeyAction('q', { type: 'adding', formValue: '' }, {})).toBeNull()
  })

  test('ArrowUp → move-up', () => {
    expect(resolveKeyAction('ArrowUp', undefined, {})).toEqual({ type: 'move-up' })
  })

  test('ArrowDown → move-down', () => {
    expect(resolveKeyAction('ArrowDown', undefined, {})).toEqual({ type: 'move-down' })
  })

  test('matching command key → returns command action', () => {
    const commands: Partial<Record<CommandId, Command>> = { 'add-task': ADD_COMMAND }
    expect(resolveKeyAction('q', undefined, commands)).toEqual(ADD_COMMAND.action)
  })

  test('unrecognised character → null', () => {
    expect(resolveKeyAction('z', undefined, {})).toBeNull()
  })

  test('multi-character string (not a key name) → null', () => {
    expect(resolveKeyAction('ab', undefined, {})).toBeNull()
  })
})

describe('handleKey - Escape always dispatches', () => {
  test('no mode, no searchQuery → dispatches go-back', () => {
    const ctx = makeCtx()
    const result = handleKey('Escape', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'go-back' })
    expect(result).toBe(true)
  })

  test('mode with non-empty formValue → dispatches update-mode with empty formValue', () => {
    const ctx = makeCtx({ mode: { type: 'adding', formValue: 'hello' } })
    handleKey('Escape', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'update-mode', formValue: '' })
  })

  test('non-empty searchQuery, no mode → dispatches update-nav clearing searchQuery', () => {
    const ctx = makeCtx({ searchQuery: 'something' })
    handleKey('Escape', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'update-nav', patch: { searchQuery: '', selected: 0 } })
  })
})

describe('handleKey - mode blocks all non-Escape keys', () => {
  test('returns false without calling dispatch/activate', () => {
    const ctx = makeCtx({ mode: { type: 'adding', formValue: '' } })
    const result = handleKey('q', ctx)
    expect(result).toBe(false)
    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(ctx.activate).not.toHaveBeenCalled()
    expect(ctx.activateSelected).not.toHaveBeenCalled()
  })
})

describe('handleKey - shortcut pickers', () => {
  test('matching shortcut key calls activate with item index and returns true', () => {
    const ctx = makeCtx({ listItems: SHORTCUT_PICKER })
    const result = handleKey('d', ctx)
    expect(ctx.activate).toHaveBeenCalledWith(0)
    expect(result).toBe(true)
  })

  test('second item shortcut key calls activate with correct index', () => {
    const ctx = makeCtx({ listItems: SHORTCUT_PICKER })
    handleKey('t', ctx)
    expect(ctx.activate).toHaveBeenCalledWith(1)
  })

  test('Enter calls activateSelected and returns true', () => {
    const ctx = makeCtx({ listItems: SHORTCUT_PICKER })
    const result = handleKey('Enter', ctx)
    expect(ctx.activateSelected).toHaveBeenCalled()
    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  test('unrecognised key returns false without calling anything', () => {
    const ctx = makeCtx({ listItems: SHORTCUT_PICKER })
    const result = handleKey('z', ctx)
    expect(result).toBe(false)
    expect(ctx.activate).not.toHaveBeenCalled()
    expect(ctx.activateSelected).not.toHaveBeenCalled()
  })
})

describe('handleKey - project search picker', () => {
  test('Enter calls activateSelected and returns true', () => {
    const ctx = makeCtx({ listItems: PROJECT_PICKER })
    const result = handleKey('Enter', ctx)
    expect(ctx.activateSelected).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  test('letter key returns false without calling anything', () => {
    const ctx = makeCtx({ listItems: PROJECT_PICKER })
    const result = handleKey('a', ctx)
    expect(result).toBe(false)
    expect(ctx.activateSelected).not.toHaveBeenCalled()
    expect(ctx.dispatch).not.toHaveBeenCalled()
  })
})

describe('handleKey - normal list', () => {
  test('ArrowUp dispatches move-up and returns true', () => {
    const ctx = makeCtx()
    const result = handleKey('ArrowUp', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'move-up' })
    expect(result).toBe(true)
  })

  test('ArrowDown dispatches move-down and returns true', () => {
    const ctx = makeCtx()
    const result = handleKey('ArrowDown', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'move-down' })
    expect(result).toBe(true)
  })

  test('Enter calls activateSelected without calling dispatch, returns true', () => {
    const ctx = makeCtx()
    const result = handleKey('Enter', ctx)
    expect(ctx.activateSelected).toHaveBeenCalled()
    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  test('command key dispatches the command action and returns true', () => {
    const ctx = makeCtx({ commands: { 'add-task': ADD_COMMAND } })
    const result = handleKey('q', ctx)
    expect(ctx.dispatch).toHaveBeenCalledWith(ADD_COMMAND.action)
    expect(result).toBe(true)
  })

  test('unknown key returns false without calling anything', () => {
    const ctx = makeCtx()
    const result = handleKey('z', ctx)
    expect(result).toBe(false)
    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(ctx.activate).not.toHaveBeenCalled()
    expect(ctx.activateSelected).not.toHaveBeenCalled()
  })
})
