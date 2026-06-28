import type { Mode, Action, Command, CommandId } from './types.js'
import { LIST_MODE } from './types.js'

// key uses DOM-style naming: 'Escape', 'ArrowUp', 'ArrowDown', or a single character.
// Ink callers: pass 'Escape'/'ArrowUp'/'ArrowDown' directly for special keys, or the input char.
export function resolveKeyAction(
  key: string,
  mode: Mode,
  commands: Partial<Record<CommandId, Command>>,
): Action | null {
  if (key === 'Escape') {
    return mode.type !== 'list' ? { type: 'set-mode', mode: LIST_MODE } : { type: 'go-back' }
  }
  if (mode.type !== 'list') return null
  if (key === 'ArrowUp') return { type: 'move-up' }
  if (key === 'ArrowDown') return { type: 'move-down' }
  const char = key.length === 1 ? key : ''
  if (char === '') return null
  const cmd = Object.values(commands).find((c): c is Command => c !== undefined && c.key === char)
  return cmd?.action ?? null
}
