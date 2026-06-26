import {
  listTasks, listProjects, listSpheres, listAgendas, listContexts, getProject,
} from 'palimpsest'
import type { Task, Project, Sphere, Agenda, Context, ProjectionState, ProjectId } from 'palimpsest'
import { INITIAL_NAV } from './types.js'
import type { UIState, View, Mode } from './types.js'

export interface ProjectStats {
  hasNext: Set<ProjectId>
  taskCount: Map<ProjectId, number>
}

export interface ViewModel {
  spheres: Sphere[]
  activeSphere: Sphere | undefined
  tasks: Task[]
  dashboardTasks: Task[]
  projects: Project[]
  agendas: Agenda[]
  contexts: Context[]
  projectStats: ProjectStats
  activeProject: Project | undefined
  projectTasks: Task[]
  activeTask: Task | undefined
  currentTask: Task | undefined
  subtitle: string
  listLength: number
  canGoBack: boolean
  view: View
  mode: Mode
  selected: number
  showCompleted: boolean
  showArchived: boolean
}

export function deriveViewModel(projState: ProjectionState, uiState: UIState): ViewModel {
  const currentNav = uiState.navStack[uiState.navStack.length - 1] ?? INITIAL_NAV
  const { view, selected, activeProjectId, activeTaskId, showCompleted, showArchived } = currentNav
  const { mode, currentSphereId } = uiState

  const spheres = listSpheres(projState)
  const activeSphere =
    (currentSphereId !== undefined ? projState.spheres.get(currentSphereId) : undefined) ??
    spheres[0]

  const tasks: Task[] = activeSphere !== undefined
    ? (() => {
        const result = listTasks(projState, { sphereId: activeSphere.id, status: showCompleted ? 'completed' : 'open' })
        if (showCompleted) result.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        return result
      })()
    : []

  const projects: Project[] = activeSphere !== undefined
    ? (() => {
        const result = listProjects(projState, { sphereId: activeSphere.id, isArchived: showArchived })
        if (showArchived) result.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
        return result
      })()
    : []

  const agendas: Agenda[] = activeSphere !== undefined
    ? listAgendas(projState, { sphereId: activeSphere.id })
    : []

  const contexts: Context[] = activeSphere !== undefined
    ? listContexts(projState, { sphereId: activeSphere.id })
    : []

  const projectStats: ProjectStats = (() => {
    const hasNext = new Set<ProjectId>()
    const taskCount = new Map<ProjectId, number>()
    for (const task of projState.tasks.values()) {
      if (task.projectId !== undefined && task.status === 'open') {
        taskCount.set(task.projectId, (taskCount.get(task.projectId) ?? 0) + 1)
        if (task.isNext === true) hasNext.add(task.projectId)
      }
    }
    return { hasNext, taskCount }
  })()

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const dashboardTasks: Task[] = (() => {
    const allOpen = activeSphere !== undefined
      ? listTasks(projState, { status: 'open', sphereId: activeSphere.id })
      : []
    const result = allOpen.filter(t =>
      (t.dueDate !== undefined && t.dueDate <= today) || t.isStarred === true
    )
    result.sort((a, b) => {
      const aDue = a.dueDate !== undefined && a.dueDate <= today
      const bDue = b.dueDate !== undefined && b.dueDate <= today
      if (aDue && bDue) return a.dueDate!.localeCompare(b.dueDate!)
      if (aDue) return -1
      if (bDue) return 1
      return 0
    })
    return result
  })()

  const activeProject = activeProjectId !== undefined
    ? getProject(projState, activeProjectId)
    : undefined

  const projectTasks: Task[] = activeProjectId !== undefined
    ? (() => {
        const result = listTasks(projState, { projectId: activeProjectId, status: showCompleted ? 'completed' : 'open' })
        if (showCompleted) result.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        return result
      })()
    : []

  const activeTask = activeTaskId !== undefined
    ? projState.tasks.get(activeTaskId)
    : undefined

  const currentTask: Task | undefined =
    view === 'task' ? activeTask
    : view === 'project' ? projectTasks[selected]
    : view === 'tasks' ? tasks[selected]
    : view === 'dashboard' ? dashboardTasks[selected]
    : undefined

  const subtitle =
    view === 'task' ? `Task: ${activeTask?.title ?? ''}`
    : view === 'project' ? `Project: ${activeProject?.name ?? ''}`
    : view === 'dashboard' ? 'Dashboard'
    : view === 'tasks' ? 'Tasks'
    : 'Projects'

  const listLength =
    view === 'tasks' ? tasks.length
    : view === 'projects' ? projects.length
    : view === 'project' ? projectTasks.length
    : view === 'dashboard' ? dashboardTasks.length
    : 0

  return {
    spheres,
    activeSphere,
    tasks,
    dashboardTasks,
    projects,
    agendas,
    contexts,
    projectStats,
    activeProject,
    projectTasks,
    activeTask,
    currentTask,
    subtitle,
    listLength,
    canGoBack: uiState.navStack.length > 1,
    view,
    mode,
    selected,
    showCompleted,
    showArchived,
  }
}
