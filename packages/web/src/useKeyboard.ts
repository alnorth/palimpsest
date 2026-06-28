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
  const { mode, listItems, commands, dispatch, activate, activateSelected, searchQuery } = appState

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // resolveKeyAction always returns non-null for escape
        dispatch(resolveKeyAction(e.key, mode, commands, searchQuery)!)
        return
      }

      if (isInputFocused()) return

      const input = e.key.length === 1 ? e.key : ''

      // Pickers with letter shortcuts: key selects directly, Enter activates selected
      const pickerView = listItems.view
      const isShortcutPicker =
        pickerView === 'picking-view' || pickerView === 'picking-agenda-for-task' ||
        pickerView === 'picking-context-for-task' || pickerView === 'picking-due-date' ||
        pickerView === 'picking-waiting-for-task' || pickerView === 'picking-waiting-agenda'
      if (isShortcutPicker) {
        const shortcutIdx = listItems.items.findIndex(item => item.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      // Search pickers: Enter only (no letter shortcuts)
      if (pickerView === 'picking-project-for-task' || pickerView === 'picking-waiting-project') {
        if (e.key === 'Enter') { activateSelected(); return }
        return
      }

      // List views: Enter activates selected item
      if (e.key === 'Enter') { activateSelected(); return }

      // Arrow navigation and letter shortcuts
      const action = resolveKeyAction(e.key, mode, commands)
      if (action !== null) { e.preventDefault(); dispatch(action) }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, listItems, commands, dispatch, activate, activateSelected, searchQuery])
}
