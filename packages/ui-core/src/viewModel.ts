import {
  listTasks, listProjects, listSpheres, listAgendas, listContexts, getProject,
  addDays, nextWeekday,
} from 'palimpsest'
import type { Task, Project, Sphere, Agenda, Context, ProjectionState, ProjectId, AgendaId, ContextId } from 'palimpsest'
import { INITIAL_NAV } from './types.js'
import type { UIState, View, Mode, TopLevelView } from './types.js'

export interface ProjectStats {
  hasNext: Set<ProjectId>
  taskCount: Map<ProjectId, number>
}

export interface ViewPickerItem {
  id: TopLevelView
  label: string
  key: string
}

export const VIEW_CONFIG: ViewPickerItem[] = [
  { id: 'dashboard', label: 'Dashboard', key: 'd' },
  { id: 'tasks',     label: 'Tasks',     key: 't' },
  { id: 'projects',  label: 'Projects',  key: 'p' },
]

export interface AgendaPickerItem {
  id: AgendaId | null
  title: string
  key?: string
}

export interface ContextPickerItem {
  id: ContextId | null
  name: string
  key?: string
}

export interface DueDateOption {
  label: string
  date: string | null
  key: string
}

export interface ProjectPickerItem {
  id: ProjectId | null
  name: string
}

export type ListItems =
  | { view: 'dashboard'; items: Task[] }
  | { view: 'tasks'; items: Task[] }
  | { view: 'project'; items: Task[] }
  | { view: 'projects'; items: Project[] }
  | { view: 'task'; items: never[] }
  | { view: 'picking-view'; items: ViewPickerItem[] }
  | { view: 'picking-agenda-for-task'; items: AgendaPickerItem[] }
  | { view: 'picking-context-for-task'; items: ContextPickerItem[] }
  | { view: 'picking-due-date'; items: DueDateOption[] }
  | { view: 'picking-project-for-task'; items: ProjectPickerItem[] }

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
  listItems: ListItems
  listLength: number
  canGoBack: boolean
  view: View
  mode: Mode
  selected: number
  searchQuery: string
  showCompleted: boolean
  showArchived: boolean
}

export function deriveViewModel(projState: ProjectionState, uiState: UIState): ViewModel {
  const currentNav = uiState.navStack[uiState.navStack.length - 1] ?? INITIAL_NAV
  const { view } = currentNav
  const selected = 'selected' in currentNav ? currentNav.selected : 0
  const activeProjectId = currentNav.view === 'project' ? currentNav.activeProjectId : undefined
  const activeTaskId = 'activeTaskId' in currentNav ? currentNav.activeTaskId : undefined
  const showCompleted = 'showCompleted' in currentNav ? currentNav.showCompleted : false
  const showArchived = 'showArchived' in currentNav ? currentNav.showArchived : false
  const searchQuery = currentNav.view === 'picking-project-for-task' ? currentNav.searchQuery : ''
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

  const isPickerView = view === 'picking-view' || view === 'picking-agenda-for-task' || view === 'picking-context-for-task' || view === 'picking-due-date' || view === 'picking-project-for-task'

  const currentTask: Task | undefined =
    view === 'task' ? activeTask
    : view === 'project' ? projectTasks[selected]
    : view === 'tasks' ? tasks[selected]
    : view === 'dashboard' ? dashboardTasks[selected]
    : isPickerView ? activeTask
    : undefined

  const subtitle =
    view === 'task' ? `Task: ${activeTask?.title ?? ''}`
    : view === 'project' ? `Project: ${activeProject?.name ?? ''}`
    : view === 'dashboard' ? 'Dashboard'
    : view === 'tasks' ? 'Tasks'
    : view === 'projects' ? 'Projects'
    : view === 'picking-view' ? 'Pick view'
    : view === 'picking-agenda-for-task' ? 'Pick agenda'
    : view === 'picking-context-for-task' ? 'Pick context'
    : view === 'picking-due-date' ? 'Pick due date'
    : view === 'picking-project-for-task' ? 'Pick project'
    : ''

  const dueDateOptions: DueDateOption[] = [
    { label: 'Today',         date: today,                  key: 'd' },
    { label: 'Tomorrow',      date: addDays(today, 1),      key: 't' },
    { label: 'Next Saturday', date: nextWeekday(today, 6),  key: 's' },
    { label: 'Next Monday',   date: nextWeekday(today, 1),  key: 'm' },
    { label: 'Custom…',       date: null,                   key: 'c' },
    { label: 'No due date',   date: null,                   key: 'x' },
  ]

  const listItems: ListItems = (() => {
    switch (view) {
      case 'dashboard': return { view, items: dashboardTasks }
      case 'tasks': return { view, items: tasks }
      case 'project': return { view, items: projectTasks }
      case 'projects': return { view, items: projects }
      case 'task': return { view, items: [] as never[] }
      case 'picking-view': return { view, items: VIEW_CONFIG }
      case 'picking-agenda-for-task': return {
        view,
        items: [
          { id: null, title: 'No agenda' },
          ...agendas.map((a): AgendaPickerItem =>
            a.key !== undefined ? { id: a.id, title: a.title, key: a.key } : { id: a.id, title: a.title }
          ),
        ],
      }
      case 'picking-context-for-task': return {
        view,
        items: [
          { id: null, name: 'No context' },
          ...contexts.map((c): ContextPickerItem =>
            c.key !== undefined ? { id: c.id, name: c.name, key: c.key } : { id: c.id, name: c.name }
          ),
        ],
      }
      case 'picking-due-date': return { view, items: dueDateOptions }
      case 'picking-project-for-task': {
        const query = searchQuery.toLowerCase().trim()
        const allProjects = activeSphere !== undefined
          ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false })
          : []
        const filtered = query === ''
          ? allProjects
          : allProjects.filter(p => p.name.toLowerCase().includes(query))
        const items: ProjectPickerItem[] = [
          ...(query === '' ? [{ id: null as null, name: 'No project' }] : []),
          ...filtered.map(p => ({ id: p.id, name: p.name })),
        ]
        return { view, items }
      }
    }
  })()

  const listLength = listItems.items.length

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
    listItems,
    listLength,
    canGoBack: uiState.navStack.length > 1,
    view,
    mode,
    selected,
    searchQuery,
    showCompleted,
    showArchived,
  }
}
