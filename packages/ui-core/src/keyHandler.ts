import type { Mode, Action, Command, CommandId } from './types.js'
import type { ListItems } from './viewModel.js'

// key uses DOM-style naming: 'Escape', 'ArrowUp', 'ArrowDown', 'Enter', or a single character.
// Ink callers: map key flags to strings before calling (e.g. key.upArrow → 'ArrowUp').
export function resolveKeyAction(
  key: string,
  mode: Mode | undefined,
  commands: Partial<Record<CommandId, Command>>,
  searchQuery = '',
): Action | null {
  if (key === 'Escape') {
    if (mode !== undefined && mode.formValue !== '') return { type: 'update-mode', formValue: '' }
    if (searchQuery !== '') return { type: 'update-nav', patch: { searchQuery: '', selected: 0 } }
    return mode !== undefined ? { type: 'exit-mode' } : { type: 'go-back' }
  }
  if (mode !== undefined) return null
  if (key === 'ArrowUp') return { type: 'move-up' }
  if (key === 'ArrowDown') return { type: 'move-down' }
  const char = key.length === 1 ? key : ''
  if (char === '') return null
  const cmd = Object.values(commands).find((c): c is Command => c !== undefined && c.key === char)
  return cmd?.action ?? null
}

export interface KeyEventContext {
  mode: Mode | undefined
  listItems: ListItems
  commands: Partial<Record<CommandId, Command>>
  searchQuery: string
  dispatch: (action: Action) => void
  activate: (index: number) => void
  activateSelected: () => void
}

// Returns true if the event was handled (caller may want to preventDefault).
// key uses DOM-style naming; Ink callers must map their key flags first.
export function handleKey(key: string, ctx: KeyEventContext): boolean {
  const { mode, listItems, commands, searchQuery, dispatch, activate, activateSelected } = ctx

  if (key === 'Escape') {
    dispatch(resolveKeyAction('Escape', mode, commands, searchQuery)!)
    return true
  }

  if (mode !== undefined) return false

  const pickerView = listItems.view
  const isShortcutPicker =
    pickerView === 'picking-view' || pickerView === 'picking-agenda-for-task' ||
    pickerView === 'picking-context-for-task' || pickerView === 'picking-due-date' ||
    pickerView === 'picking-waiting-for-task' || pickerView === 'picking-waiting-agenda'

  if (isShortcutPicker) {
    const char = key.length === 1 ? key : ''
    const shortcutIdx = listItems.items.findIndex(item => item.key === char)
    if (shortcutIdx !== -1) { activate(shortcutIdx); return true }
    if (key === 'Enter') { activateSelected(); return true }
    return false
  }

  if (pickerView === 'picking-project-for-task' || pickerView === 'picking-waiting-project') {
    if (key === 'Enter') { activateSelected(); return true }
    return false
  }

  if (pickerView === 'agendas') {
    const char = key.length === 1 ? key : ''
    const shortcutIdx = char === ''
      ? -1
      : listItems.items.findIndex(item => item.kind === 'agenda' && item.agenda.key === char)
    if (shortcutIdx !== -1) { activate(shortcutIdx); return true }
  }

  if (key === 'Enter') { activateSelected(); return true }

  const action = resolveKeyAction(key, mode, commands)
  if (action !== null) { dispatch(action); return true }

  return false
}
