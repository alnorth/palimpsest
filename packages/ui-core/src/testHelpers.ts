import { INITIAL_UI_STATE } from './types.js'
import type { UIState } from './types.js'

export function makeUIState(overrides: Partial<UIState> = {}): UIState {
  return { ...INITIAL_UI_STATE, ...overrides }
}
