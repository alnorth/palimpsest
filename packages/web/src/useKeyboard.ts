import { useEffect } from 'react'
import { resolveKeyAction } from 'palimpsest-ui-core'
import type { AppStateResult } from 'palimpsest-ui-core'

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea'
}

export function useKeyboard(
  appState: AppStateResult,
): void {
  const { mode, listItems, commands, dispatch, activate, activateSelected } = appState

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // resolveKeyAction always returns non-null for escape
        dispatch(resolveKeyAction(e.key, mode, commands)!)
        return
      }

      if (isInputFocused()) return

      if (e.key === 'ArrowUp') { dispatch({ type: 'move-up' }); return }
      if (e.key === 'ArrowDown') { dispatch({ type: 'move-down' }); return }

      const input = e.key.length === 1 ? e.key : ''

      // Picker views: letter shortcuts select by key, Enter activates selected
      if (listItems.view === 'picking-view') {
        const shortcutIdx = listItems.items.findIndex(item => item.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      if (listItems.view === 'picking-agenda-for-task') {
        const shortcutIdx = listItems.items.findIndex(a => a.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      if (listItems.view === 'picking-context-for-task') {
        const shortcutIdx = listItems.items.findIndex(c => c.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      if (listItems.view === 'picking-due-date') {
        const shortcutIdx = listItems.items.findIndex(o => o.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      if (listItems.view === 'picking-project-for-task') {
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      // List views: Enter activates selected item
      if (e.key === 'Enter') { activateSelected(); return }

      // Letter command shortcuts
      if (input !== '') {
        const action = resolveKeyAction(e.key, mode, commands)
        if (action !== null) { e.preventDefault(); dispatch(action) }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, listItems, commands, dispatch, activate, activateSelected])
}
