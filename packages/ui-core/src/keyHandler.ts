import type { Mode, Action, Command, CommandId } from './types.js'

// key uses DOM-style naming: 'Escape', 'ArrowUp', 'ArrowDown', or a single character.
// Ink callers: pass 'Escape'/'ArrowUp'/'ArrowDown' directly for special keys, or the input char.
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
