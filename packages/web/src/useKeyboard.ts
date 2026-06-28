import { useEffect } from 'react'
import { handleKey } from 'palimpsest-ui-core'
import type { AppStateResult } from 'palimpsest-ui-core'

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea'
}

export function useKeyboard(appState: AppStateResult): void {
  const { mode, listItems, commands, dispatch, activate, activateSelected, searchQuery } = appState

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isInputFocused() && e.key !== 'Escape') return
      if (handleKey(e.key, { mode, listItems, commands, searchQuery, dispatch, activate, activateSelected })) {
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, listItems, commands, dispatch, activate, activateSelected, searchQuery])
}
