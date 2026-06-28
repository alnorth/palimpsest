import type { Mode, Action, Command, CommandId } from './types.js'

export function resolveKeyAction(
  key: string,
  escape: boolean,
  upArrow: boolean,
  downArrow: boolean,
  mode: Mode,
  commands: Partial<Record<CommandId, Command>>,
): Action | null {
  if (escape) {
    return mode !== 'list' ? { type: 'set-mode', mode: 'list' } : { type: 'go-back' }
  }
  if (mode !== 'list') return null
  if (upArrow) return { type: 'move-up' }
  if (downArrow) return { type: 'move-down' }
  const char = key.length === 1 ? key : ''
  if (char === '') return null
  const cmd = Object.values(commands).find((c): c is Command => c !== undefined && c.key === char)
  return cmd?.action ?? null
}
