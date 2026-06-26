import { INITIAL_NAV } from './types.js'
import type { UIState, UIAction } from './types.js'

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'navigate':
      return { ...state, navStack: [...state.navStack, action.navState] }

    case 'set-nav':
      return { ...state, navStack: [action.navState] }

    case 'go-back':
      return state.navStack.length > 1
        ? { ...state, navStack: state.navStack.slice(0, -1) }
        : state

    case 'update-nav': {
      const last = state.navStack[state.navStack.length - 1] ?? INITIAL_NAV
      return {
        ...state,
        navStack: [...state.navStack.slice(0, -1), { ...last, ...action.patch }],
      }
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

    case 'set-view-picker-selected':
      return { ...state, viewPickerSelected: action.index }

    case 'set-agenda-picker-selected':
      return { ...state, agendaPickerSelected: action.index }

    case 'set-context-picker-selected':
      return { ...state, contextPickerSelected: action.index }

    case 'set-due-date-picker-selected':
      return { ...state, dueDatePickerSelected: action.index }

    case 'set-project-picker-selected':
      return { ...state, projectPickerSelected: action.index }

  }
}
