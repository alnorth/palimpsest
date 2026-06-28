import type { NavState, TopLevelView } from './types.js'

export function indexAfterAppend(list: readonly unknown[]): number {
  return list.length
}

export function indexAfterRemove(list: readonly unknown[], selected: number): number {
  return Math.max(0, Math.min(selected, list.length - 2))
}

export function navStateForTopLevelView(view: TopLevelView): NavState {
  if (view === 'tasks') return { view: 'tasks', selected: 0, showCompleted: false }
  if (view === 'projects') return { view: 'projects', selected: 0, showArchived: false }
  if (view === 'processing') return { view: 'processing', selected: 0 }
  if (view === 'waiting') return { view: 'waiting', selected: 0 }
  return { view: 'dashboard', selected: 0 }
}
