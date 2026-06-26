import { useEffect } from 'react'
import type { AppStateResult } from 'palimpsest-ui-core'

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea'
}

export function useKeyboard(
  appState: AppStateResult,
  formValue: string,
  setFormValue: (v: string) => void,
): void {
  const { mode, selected, listLength, listItems, currentTask, agendas, contexts, commands, dispatch, activate } = appState

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (mode !== 'list') {
          setFormValue('')
          dispatch({ type: 'set-mode', mode: 'list' })
        } else {
          dispatch({ type: 'go-back' })
        }
        return
      }

      if (isInputFocused()) return
      if (mode !== 'list') return

      if (e.key === 'ArrowUp') {
        dispatch({ type: 'update-nav', patch: { selected: Math.max(0, selected - 1) } })
        return
      }
      if (e.key === 'ArrowDown') {
        dispatch({ type: 'update-nav', patch: { selected: Math.min(Math.max(0, listLength - 1), selected + 1) } })
        return
      }

      const input = e.key.length === 1 ? e.key : ''

      // Picker views: letter shortcuts select by key, Enter activates selected
      if (listItems.view === 'picking-view') {
        const shortcutIdx = listItems.items.findIndex(item => item.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activate(selected); return }
        return
      }

      if (listItems.view === 'picking-agenda-for-task') {
        const shortcutIdx = listItems.items.findIndex(a => a.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activate(selected); return }
        return
      }

      if (listItems.view === 'picking-context-for-task') {
        const shortcutIdx = listItems.items.findIndex(c => c.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activate(selected); return }
        return
      }

      if (listItems.view === 'picking-due-date') {
        const shortcutIdx = listItems.items.findIndex(o => o.key === input)
        if (shortcutIdx !== -1) { activate(shortcutIdx); return }
        if (e.key === 'Enter') { activate(selected); return }
        return
      }

      if (listItems.view === 'picking-project-for-task') {
        if (e.key === 'Enter') { activate(selected); return }
        return
      }

      // List views: Enter activates selected item
      if (e.key === 'Enter') {
        activate(selected)
        return
      }

      // Letter command shortcuts
      if (input !== '') {
        const cmd = Object.values(commands).find(c => c.key === input)
        if (cmd !== undefined) {
          if (cmd.id === 'edit-task' && currentTask !== undefined) setFormValue(currentTask.title)
          if (cmd.id === 'edit-description') setFormValue(currentTask?.description ?? '')
          if (cmd.id === 'set-recurrence') setFormValue(currentTask?.dueDateExpression ?? '')
          if (cmd.id === 'edit-project' && listItems.view === 'projects') setFormValue(listItems.items[selected]?.name ?? '')
          if (cmd.id === 'pick-agenda' && currentTask !== undefined) {
            const idx = currentTask.agendaId !== undefined ? agendas.findIndex(a => a.id === currentTask.agendaId) + 1 : 0
            dispatch({ type: 'navigate', navState: { view: 'picking-agenda-for-task', selected: Math.max(0, idx), activeTaskId: currentTask.id } })
          } else if (cmd.id === 'pick-context' && currentTask !== undefined) {
            const idx = currentTask.contextId !== undefined ? contexts.findIndex(c => c.id === currentTask.contextId) + 1 : 0
            dispatch({ type: 'navigate', navState: { view: 'picking-context-for-task', selected: Math.max(0, idx), activeTaskId: currentTask.id } })
          } else if (cmd.id === 'pick-project' && currentTask !== undefined) {
            dispatch({ type: 'navigate', navState: { view: 'picking-project-for-task', selected: 0, activeTaskId: currentTask.id, searchQuery: '' } })
          } else {
            dispatch(cmd.action)
          }
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, selected, listLength, listItems, currentTask, agendas, contexts, commands, dispatch, activate, formValue, setFormValue])
}
