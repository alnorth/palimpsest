import { INITIAL_NAV } from './types.js'
import type { UIState, UIAction } from './types.js'

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'navigate':
      return { ...state, navStack: [...state.navStack, action.navState], mode: undefined }

    case 'set-nav':
      return { ...state, navStack: [action.navState], mode: undefined }

    case 'go-back': {
      const steps = action.steps ?? 1
      const minLength = Math.max(1, state.navStack.length - steps)
      return state.navStack.length > 1
        ? { ...state, navStack: state.navStack.slice(0, minLength), mode: undefined }
        : state
    }

    case 'update-nav': {
      const last = state.navStack[state.navStack.length - 1] ?? INITIAL_NAV
      if (last.view === 'task') return state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = { ...last } as any
      if (action.patch.selected !== undefined) next.selected = action.patch.selected
      if (action.patch.searchQuery !== undefined && (last.view === 'picking-project-for-task' || last.view === 'picking-waiting-project')) {
        next.searchQuery = action.patch.searchQuery
      }
      return { ...state, navStack: [...state.navStack.slice(0, -1), next as typeof last] }
    }

    case 'set-mode':
      return { ...state, mode: action.mode }

    case 'exit-mode':
      return { ...state, mode: undefined }

    case 'update-mode': {
      const { mode } = state
      if (mode === undefined) return state
      return { ...state, mode: { ...mode, formValue: action.formValue } }
    }

    case 'set-sphere':
      return {
        ...state,
        currentSphereId: action.sphereId,
        navStack: [INITIAL_NAV],
        mode: undefined,
      }

    case 'move-up':
    case 'move-down':
      return state
  }
}
