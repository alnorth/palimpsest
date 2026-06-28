import {
  listTasks, listProjects, listSpheres, listAgendas, listContexts, getProject,
  addDays, nextWeekday,
} from 'palimpsest'
import type { Task, Project, Sphere, Agenda, Context, ProjectionState, ProjectId, AgendaId, ContextId } from 'palimpsest'
import { INITIAL_NAV } from './types.js'
import type { UIState, View, Mode, TopLevelView } from './types.js'
import { AGENDA_PREFIX, CONTEXT_PREFIX } from './prefixes.js'

export interface ProjectStats {
  hasNext: Set<ProjectId>
  taskCount: Map<ProjectId, number>
}

export interface PickerItem<T> {
  label: string
  prefix?: string | undefined
  key?: string | undefined
  value: T
}

export type WaitingKind = 'clear' | 'review' | 'agenda' | 'project'

export type ViewPickerItem = PickerItem<TopLevelView>
export type AgendaPickerItem = PickerItem<AgendaId | null>
export type ContextPickerItem = PickerItem<ContextId | null>
export type DueDateOption = PickerItem<string | null>
export type ProjectPickerItem = PickerItem<ProjectId | null>
export type WaitingKindOption = PickerItem<WaitingKind>

export const VIEW_CONFIG: ViewPickerItem[] = [
  { value: 'dashboard',  label: 'Dashboard',  key: 'd' },
  { value: 'tasks',      label: 'Tasks',      key: 't' },
  { value: 'projects',   label: 'Projects',   key: 'p' },
  { value: 'processing', label: 'Processing', key: 'r' },
]

export interface ListGroup<T> {
  title: string
  items: T[]
}

export function flatItems<T>(groups: ListGroup<T>[]): T[] {
  return groups.flatMap(g => g.items)
}

export type ListItem =
  | { kind: 'task'; task: Task }
  | { kind: 'project'; project: Project }

type MainListItems = { view: 'dashboard' | 'tasks' | 'project' | 'projects' | 'processing'; groups: ListGroup<ListItem>[]; items: ListItem[]; emptyMessage: string; selectedItem: ListItem | undefined }

type PickerListItems<V extends View, T> = {
  view: V
  groups: ListGroup<PickerItem<T>>[]
  items: PickerItem<T>[]
  selectedItem: PickerItem<T> | undefined
}

export type ListItems =
  | MainListItems
  | { view: 'task'; groups: ListGroup<never>[]; items: never[] }
  | PickerListItems<'picking-view', TopLevelView>
  | PickerListItems<'picking-agenda-for-task', AgendaId | null>
  | PickerListItems<'picking-context-for-task', ContextId | null>
  | PickerListItems<'picking-due-date', string | null>
  | PickerListItems<'picking-project-for-task', ProjectId | null>
  | PickerListItems<'picking-waiting-for-task', WaitingKind>
  | PickerListItems<'picking-waiting-agenda', AgendaId>
  | PickerListItems<'picking-waiting-project', ProjectId>

export interface ViewModel {
  spheres: Sphere[]
  activeSphere: Sphere | undefined
  agendas: Agenda[]
  contexts: Context[]
  projectStats: ProjectStats
  activeProject: Project | undefined
  activeTask: Task | undefined
  selectedItem: ListItem | undefined
  selectedProject: Project | undefined
  currentTask: Task | undefined
  subtitle: string
  listItems: ListItems
  canGoBack: boolean
  view: View
  mode: Mode | undefined
  formValue: string
  searchQuery: string
  showCompleted: boolean
  showArchived: boolean
  showProject: boolean
}

export function deriveViewModel(projState: ProjectionState, uiState: UIState): ViewModel {
  const currentNav = uiState.navStack[uiState.navStack.length - 1] ?? INITIAL_NAV
  const { view } = currentNav
  const selected = 'selected' in currentNav ? currentNav.selected : 0
  const activeProjectId = currentNav.view === 'project' ? currentNav.activeProjectId : undefined
  const activeTaskId = 'activeTaskId' in currentNav ? currentNav.activeTaskId : undefined
  const showCompleted = 'showCompleted' in currentNav ? currentNav.showCompleted : false
  const showArchived = 'showArchived' in currentNav ? currentNav.showArchived : false
  const searchQuery = (currentNav.view === 'picking-project-for-task' || currentNav.view === 'picking-waiting-project') ? currentNav.searchQuery : ''
  const { mode, currentSphereId } = uiState
  const formValue = mode?.formValue ?? ''

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

  const inboxTasks: Task[] = activeSphere !== undefined
    ? listTasks(projState, { sphereId: activeSphere.id, status: 'open' })
        .filter(t =>
          t.dueDate === undefined &&
          t.agendaId === undefined &&
          t.contextId === undefined &&
          t.projectId === undefined
        )
    : []

  const projectsWithoutNext: Project[] = activeSphere !== undefined
    ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false })
        .filter(p => !projectStats.hasNext.has(p.id))
    : []

  const isPickerView = view === 'picking-view' || view === 'picking-agenda-for-task' || view === 'picking-context-for-task' || view === 'picking-due-date' || view === 'picking-project-for-task' || view === 'picking-waiting-for-task' || view === 'picking-waiting-agenda' || view === 'picking-waiting-project'


  const listItems: ListItems = (() => {
    switch (view) {
      case 'dashboard': {
        const items = dashboardTasks.map((t): ListItem => ({ kind: 'task', task: t }))
        return { view, groups: [{ title: '', items }], items, emptyMessage: 'No tasks due today and no starred tasks.', selectedItem: items[selected] }
      }
      case 'tasks': {
        const items = tasks.map((t): ListItem => ({ kind: 'task', task: t }))
        return { view, groups: [{ title: '', items }], items, emptyMessage: showCompleted ? 'No completed tasks in this sphere.' : 'No open tasks in this sphere.', selectedItem: items[selected] }
      }
      case 'project': {
        const items = projectTasks.map((t): ListItem => ({ kind: 'task', task: t }))
        return { view, groups: [{ title: '', items }], items, emptyMessage: showCompleted ? 'No completed tasks in this project.' : 'No open tasks in this project.', selectedItem: items[selected] }
      }
      case 'projects': {
        const items = projects.map((p): ListItem => ({ kind: 'project', project: p }))
        return { view, groups: [{ title: '', items }], items, emptyMessage: showArchived ? 'No archived projects.' : 'No projects.', selectedItem: items[selected] }
      }
      case 'processing': {
        const groups: ListGroup<ListItem>[] = [
          { title: 'Inbox tasks', items: inboxTasks.map((t): ListItem => ({ kind: 'task', task: t })) },
          { title: 'Projects without a next action', items: projectsWithoutNext.map((p): ListItem => ({ kind: 'project', project: p })) },
        ]
        const items = flatItems(groups)
        return { view, groups, items, emptyMessage: 'Nothing to process.', selectedItem: items[selected] }
      }
      case 'task': return { view, groups: [], items: [] }
      case 'picking-view': return { view, groups: [{ title: '', items: VIEW_CONFIG }], items: VIEW_CONFIG, selectedItem: VIEW_CONFIG[selected] }
      case 'picking-agenda-for-task': {
        const items: PickerItem<AgendaId | null>[] = [
          { label: 'No agenda', value: null },
          ...agendas.map((a): PickerItem<AgendaId | null> => ({ label: a.title, prefix: AGENDA_PREFIX, value: a.id, ...(a.key !== undefined && { key: a.key }) })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-context-for-task': {
        const items: PickerItem<ContextId | null>[] = [
          { label: 'No context', value: null },
          ...contexts.map((c): PickerItem<ContextId | null> => ({ label: c.name, prefix: CONTEXT_PREFIX, value: c.id, ...(c.key !== undefined && { key: c.key }) })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-due-date': {
        const items: PickerItem<string | null>[] = [
          { label: 'Today',         value: today,                 key: 'd' },
          { label: 'Tomorrow',      value: addDays(today, 1),     key: 't' },
          { label: 'Next Saturday', value: nextWeekday(today, 6), key: 's' },
          { label: 'Next Monday',   value: nextWeekday(today, 1), key: 'm' },
          { label: 'Custom…',       value: 'custom',              key: 'c' },
          { label: 'No due date',   value: null,                  key: 'x' },
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-project-for-task': {
        const query = searchQuery.toLowerCase().trim()
        const allProjects = activeSphere !== undefined
          ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false })
          : []
        const filtered = query === ''
          ? allProjects
          : allProjects.filter(p => p.name.toLowerCase().includes(query))
        const items: PickerItem<ProjectId | null>[] = [
          ...(query === '' ? [{ label: 'No project', value: null as null }] : []),
          ...filtered.map(p => ({ label: p.name, value: p.id })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-for-task': {
        const items: PickerItem<WaitingKind>[] = [
          { value: 'clear',   label: 'Not waiting', key: 'x' },
          { value: 'review',  label: 'Review',      key: 'r' },
          { value: 'agenda',  label: 'Agenda…',     key: 'a' },
          { value: 'project', label: 'Project…',    key: 'p' },
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-agenda': {
        const items: PickerItem<AgendaId>[] = agendas.map((a): PickerItem<AgendaId> => ({
          label: a.title, prefix: AGENDA_PREFIX, value: a.id, ...(a.key !== undefined && { key: a.key }),
        }))
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-project': {
        const query = searchQuery.toLowerCase().trim()
        const allProjects = activeSphere !== undefined
          ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false })
          : []
        const filtered = query === ''
          ? allProjects
          : allProjects.filter(p => p.name.toLowerCase().includes(query))
        const items: PickerItem<ProjectId>[] = filtered.map(p => ({ label: p.name, value: p.id }))
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
    }
  })()

  const selectedItem: ListItem | undefined = (
    listItems.view === 'dashboard' || listItems.view === 'tasks' || listItems.view === 'project' ||
    listItems.view === 'projects' || listItems.view === 'processing'
  ) ? listItems.selectedItem : undefined

  const selectedProject: Project | undefined = selectedItem?.kind === 'project' ? selectedItem.project : undefined

  const currentTask: Task | undefined =
    listItems.view === 'task' ? activeTask
    : selectedItem !== undefined ? (selectedItem.kind === 'task' ? selectedItem.task : undefined)
    : isPickerView ? activeTask
    : undefined

  const taskSuffix = currentTask !== undefined ? ` — ${currentTask.title}` : ''
  const subtitle =
    view === 'task' ? `Task: ${activeTask?.title ?? ''}`
    : view === 'project' ? `Project: ${activeProject?.name ?? ''}`
    : view === 'dashboard' ? 'Dashboard'
    : view === 'tasks' ? 'Tasks'
    : view === 'projects' ? 'Projects'
    : view === 'processing' ? 'Processing'
    : view === 'picking-view' ? 'View'
    : view === 'picking-agenda-for-task' ? `Agenda${taskSuffix}`
    : view === 'picking-context-for-task' ? `Context${taskSuffix}`
    : view === 'picking-due-date' ? `Due date${taskSuffix}`
    : view === 'picking-project-for-task' ? `Project${taskSuffix}`
    : view === 'picking-waiting-for-task' ? `Waiting for${taskSuffix}`
    : view === 'picking-waiting-agenda' ? `Waiting for agenda${taskSuffix}`
    : view === 'picking-waiting-project' ? `Waiting for project${taskSuffix}`
    : ''

  const showProject = view === 'dashboard' || view === 'tasks'

  return {
    spheres,
    activeSphere,
    agendas,
    contexts,
    projectStats,
    activeProject,
    activeTask,
    selectedItem,
    selectedProject,
    currentTask,
    subtitle,
    listItems,
    canGoBack: uiState.navStack.length > 1,
    view,
    mode,
    formValue,
    searchQuery,
    showCompleted,
    showArchived,
    showProject,
  }
}
