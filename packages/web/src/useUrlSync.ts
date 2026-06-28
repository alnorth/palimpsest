import { useEffect } from 'react'
import type { SphereId, TaskId, ProjectId } from 'palimpsest'
import type { View, NavState, Action } from 'palimpsest-ui-core'
import { VIEW_CONFIG, navStateForTopLevelView } from 'palimpsest-ui-core'

// URL schema:
//   /:sphereId/dashboard
//   /:sphereId/tasks
//   /:sphereId/projects
//   /:sphereId/projects/:projectId
//   /:sphereId/tasks/:taskId
//
// Picker overlays and transient mode state are not reflected in the URL.

interface Params {
  view: View
  sphereId: SphereId | undefined
  activeTaskId: TaskId | undefined
  activeProjectId: ProjectId | undefined
  dispatch: (action: Action) => void
}

function toPath(
  view: View,
  sphereId: SphereId | undefined,
  activeTaskId: TaskId | undefined,
  activeProjectId: ProjectId | undefined,
): string | null {
  if (sphereId === undefined) return null
  switch (view) {
    case 'dashboard': return `/${sphereId}/dashboard`
    case 'tasks':     return `/${sphereId}/tasks`
    case 'projects':  return `/${sphereId}/projects`
    case 'processing': return `/${sphereId}/processing`
    case 'waiting':   return `/${sphereId}/waiting`
    case 'project':   return activeProjectId !== undefined ? `/${sphereId}/projects/${activeProjectId}` : null
    case 'task':      return activeTaskId !== undefined ? `/${sphereId}/tasks/${activeTaskId}` : null
    default:          return null // picking-* views — leave URL alone
  }
}

function applyPath(pathname: string, dispatch: (action: Action) => void): void {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return
  const [sphereId, section, id] = parts
  if (sphereId === undefined || section === undefined) return

  const topLevelView = id === undefined ? VIEW_CONFIG.find(v => v.value === section) : undefined
  let navState: NavState | null = null
  if (topLevelView !== undefined) {
    navState = navStateForTopLevelView(topLevelView.value)
  } else if (section === 'projects' && id !== undefined) {
    navState = { view: 'project', selected: 0, activeProjectId: id as ProjectId, showCompleted: false }
  } else if (section === 'tasks' && id !== undefined) {
    navState = { view: 'task', activeTaskId: id as TaskId }
  }

  if (navState === null) return
  dispatch({ type: 'set-sphere', sphereId: sphereId as SphereId })
  dispatch({ type: 'set-nav', navState })
}

export function useUrlSync({ view, sphereId, activeTaskId, activeProjectId, dispatch }: Params): void {
  // Apply URL on mount so that a bookmarked/pasted URL sets the initial nav state.
  useEffect(() => {
    applyPath(window.location.pathname, dispatch)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally mount-only

  // Handle browser back/forward. After popstate fires the browser has already
  // updated window.location, so the state→URL effect below will see an equal
  // path and skip the redundant pushState.
  useEffect(() => {
    function handlePopState() {
      applyPath(window.location.pathname, dispatch)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [dispatch])

  // Reflect in-app navigation into the URL. Skips picker views (toPath returns
  // null) and skips when the path is already current (avoids duplicate entries).
  useEffect(() => {
    const path = toPath(view, sphereId, activeTaskId, activeProjectId)
    if (path === null || path === window.location.pathname) return
    window.history.pushState(null, '', path)
  }, [view, sphereId, activeTaskId, activeProjectId])
}
