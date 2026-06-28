import { INITIAL_NAV } from './types.js'
import type { UIState, UIAction } from './types.js'

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'navigate':
      return { ...state, navStack: [...state.navStack, action.navState], mode: 'list' }

    case 'set-nav':
      return { ...state, navStack: [action.navState], mode: 'list' }

    case 'go-back':
      return state.navStack.length > 1
        ? { ...state, navStack: state.navStack.slice(0, -1) }
        : state

    case 'update-nav': {
      const last = state.navStack[state.navStack.length - 1] ?? INITIAL_NAV
      if (last.view === 'task') return state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = { ...last } as any
      if (action.patch.selected !== undefined) next.selected = action.patch.selected
      if (action.patch.searchQuery !== undefined && last.view === 'picking-project-for-task') {
        next.searchQuery = action.patch.searchQuery
      }
      return { ...state, navStack: [...state.navStack.slice(0, -1), next as typeof last] }
    }

    case 'set-mode':
      return { ...state, mode: action.mode }

    case 'set-sphere':
      return {
        ...state,
        currentSphereId: action.sphereId,
        navStack: [INITIAL_NAV],
        mode: 'list',
      }

    case 'move-up':
    case 'move-down':
      return state
  }
}
