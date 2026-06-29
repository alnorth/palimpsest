import {
  listTasks, listProjects, listSpheres, listAgendas, listContexts, getProject,
  addDays, nextWeekday,
} from 'palimpsest'
import type { Task, Project, Sphere, Agenda, Context, ProjectionState, ProjectId, AgendaId, ContextId, WaitingFor } from 'palimpsest'
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

export type WaitingKind = 'clear' | 'review' | 'agenda' | 'project' | 'trello'

export type ViewPickerItem = PickerItem<TopLevelView>
export type AgendaPickerItem = PickerItem<AgendaId | null>
export type ContextPickerItem = PickerItem<ContextId | null>
export type DueDateOption = PickerItem<string | null>
export type ProjectPickerItem = PickerItem<ProjectId | null>
export type WaitingKindOption = PickerItem<WaitingKind>
export type WaitingAgendaPickerItem = PickerItem<AgendaId>
export type WaitingProjectPickerItem = PickerItem<ProjectId>

const WAITING_KIND_LABELS: Record<WaitingFor['kind'], string> = {
  review: 'Review',
  agenda: 'Agenda',
  project: 'Project',
  trello: 'Trello',
}

export const VIEW_CONFIG: ViewPickerItem[] = [
  { value: 'dashboard',  label: 'Dashboard',  key: 'd' },
  { value: 'tasks',      label: 'Tasks',      key: 't' },
  { value: 'projects',   label: 'Projects',   key: 'p' },
  { value: 'processing', label: 'Processing', key: 'r' },
  { value: 'waiting',    label: 'Waiting',    key: 'w' },
  { value: 'pick-list',  label: 'Pick list',  key: 'l' },
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

export type MainListItems = { view: 'dashboard' | 'tasks' | 'project' | 'projects' | 'processing' | 'waiting' | 'pick-list'; groups: ListGroup<ListItem>[]; items: ListItem[]; emptyMessage: string; selectedItem: ListItem | undefined }

export function isMainListItems(items: ListItems): items is MainListItems {
  return 'emptyMessage' in items
}

type PickerListItems<V extends View, Item> = {
  view: V
  groups: ListGroup<Item>[]
  items: Item[]
  selectedItem: Item | undefined
}

export type ListItems =
  | MainListItems
  | { view: 'task'; groups: ListGroup<never>[]; items: never[] }
  | PickerListItems<'picking-view',              ViewPickerItem>
  | PickerListItems<'picking-agenda-for-task',   AgendaPickerItem>
  | PickerListItems<'picking-context-for-task',  ContextPickerItem>
  | PickerListItems<'picking-due-date',          DueDateOption>
  | PickerListItems<'picking-project-for-task',  ProjectPickerItem>
  | PickerListItems<'picking-waiting-for-task',  WaitingKindOption>
  | PickerListItems<'picking-waiting-agenda',    WaitingAgendaPickerItem>
  | PickerListItems<'picking-waiting-project',   WaitingProjectPickerItem>

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

function searchProjects(projState: ProjectionState, activeSphere: Sphere | undefined, searchQuery: string): Project[] {
  const query = searchQuery.toLowerCase().trim()
  const all = activeSphere !== undefined ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false }) : []
  return query === '' ? all : all.filter(p => p.name.toLowerCase().includes(query))
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
        const result = listTasks(projState, { projectId: activeProjectId, status: showCompleted ? 'completed' : 'open', showArchivedProjects: true })
        if (showCompleted) result.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        return result
      })()
    : []

  const activeTask = activeTaskId !== undefined
    ? projState.tasks.get(activeTaskId)
    : undefined

  const actionableTasks: Task[] = activeSphere !== undefined
    ? listTasks(projState, { sphereId: activeSphere.id, status: 'open', isActionable: true, isWaiting: false, hasDueDate: false, hasAgenda: false, hasContext: false })
    : []

  const projectsWithoutNext: Project[] = activeSphere !== undefined
    ? listProjects(projState, { sphereId: activeSphere.id, isArchived: false })
        .filter(p => !projectStats.hasNext.has(p.id))
    : []

  const tasksWaitingOnArchivedProjects: Task[] = activeSphere !== undefined
    ? listTasks(projState, { sphereId: activeSphere.id, status: 'open', isWaiting: true })
        .filter(t => {
          if (t.waitingFor?.kind !== 'project') return false
          const p = projState.projects.get(t.waitingFor.projectId)
          return p === undefined || p.isArchived === true
        })
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
          { title: 'Actionable tasks', items: actionableTasks.map((t): ListItem => ({ kind: 'task', task: t })) },
          { title: 'Projects without a next action', items: projectsWithoutNext.map((p): ListItem => ({ kind: 'project', project: p })) },
          { title: 'Waiting on archived projects', items: tasksWaitingOnArchivedProjects.map((t): ListItem => ({ kind: 'task', task: t })) },
        ]
        const items = flatItems(groups)
        return { view, groups, items, emptyMessage: 'Nothing to process.', selectedItem: items[selected] }
      }
      case 'waiting': {
        const waitingTasks: Task[] = activeSphere !== undefined
          ? listTasks(projState, { sphereId: activeSphere.id, status: 'open', isWaiting: true })
          : []

        const groups: ListGroup<ListItem>[] = (Object.keys(WAITING_KIND_LABELS) as Array<WaitingFor['kind']>).flatMap(kind => {
          const kindTasks = waitingTasks.filter(t => t.waitingFor?.kind === kind)
          if (kindTasks.length === 0) return []
          return [{ title: WAITING_KIND_LABELS[kind], items: kindTasks.map((t): ListItem => ({ kind: 'task', task: t })) }]
        })
        const items = flatItems(groups)
        return { view, groups, items, emptyMessage: 'No waiting tasks.', selectedItem: items[selected] }
      }
      case 'pick-list': {
        const eligible = activeSphere !== undefined
          ? listTasks(projState, { sphereId: activeSphere.id, status: 'open', isActionable: true, hasContext: true })
          : []

        const byContext = new Map<ContextId, Task[]>()
        for (const task of eligible) {
          const key = task.contextId!
          const bucket = byContext.get(key)
          if (bucket !== undefined) bucket.push(task)
          else byContext.set(key, [task])
        }

        const groups: ListGroup<ListItem>[] = []
        for (const context of contexts) {
          const bucket = byContext.get(context.id)
          if (bucket !== undefined && bucket.length > 0) {
            groups.push({ title: context.name, items: bucket.map((t): ListItem => ({ kind: 'task', task: t })) })
          }
        }

        const items = flatItems(groups)
        return { view, groups, items, emptyMessage: 'No tasks available.', selectedItem: items[selected] }
      }
      case 'task': return { view, groups: [], items: [] }
      case 'picking-view': return { view, groups: [{ title: '', items: VIEW_CONFIG }], items: VIEW_CONFIG, selectedItem: VIEW_CONFIG[selected] }
      case 'picking-agenda-for-task': {
        const items: AgendaPickerItem[] = [
          { label: 'No agenda', value: null },
          ...agendas.map((a): AgendaPickerItem => ({ label: a.title, prefix: AGENDA_PREFIX, value: a.id, ...(a.key !== undefined && { key: a.key }) })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-context-for-task': {
        const items: ContextPickerItem[] = [
          { label: 'No context', value: null },
          ...contexts.map((c): ContextPickerItem => ({ label: c.name, prefix: CONTEXT_PREFIX, value: c.id, ...(c.key !== undefined && { key: c.key }) })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-due-date': {
        const items: DueDateOption[] = [
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
        const filtered = searchProjects(projState, activeSphere, searchQuery)
        const items: ProjectPickerItem[] = [
          ...(searchQuery.trim() === '' ? [{ label: 'No project', value: null as null }] : []),
          ...filtered.map(p => ({ label: p.name, value: p.id })),
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-for-task': {
        const items: WaitingKindOption[] = [
          { value: 'clear',   label: 'Not waiting', key: 'x' },
          { value: 'review',  label: 'Review',      key: 'r' },
          { value: 'agenda',  label: 'Agenda…',     key: 'a' },
          { value: 'project', label: 'Project…',    key: 'p' },
        ]
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-agenda': {
        const items: WaitingAgendaPickerItem[] = agendas.map((a): WaitingAgendaPickerItem => ({
          label: a.title, prefix: AGENDA_PREFIX, value: a.id, ...(a.key !== undefined && { key: a.key }),
        }))
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
      case 'picking-waiting-project': {
        const items: WaitingProjectPickerItem[] = searchProjects(projState, activeSphere, searchQuery).map(p => ({ label: p.name, value: p.id }))
        return { view, groups: [{ title: '', items }], items, selectedItem: items[selected] }
      }
    }
  })()

  const selectedItem: ListItem | undefined = isMainListItems(listItems) ? listItems.selectedItem : undefined

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
    : view === 'waiting' ? 'Waiting'
    : view === 'pick-list' ? 'Pick list'
    : view === 'picking-view' ? 'View'
    : view === 'picking-agenda-for-task' ? `Agenda${taskSuffix}`
    : view === 'picking-context-for-task' ? `Context${taskSuffix}`
    : view === 'picking-due-date' ? `Due date${taskSuffix}`
    : view === 'picking-project-for-task' ? `Project${taskSuffix}`
    : view === 'picking-waiting-for-task' ? `Waiting for${taskSuffix}`
    : view === 'picking-waiting-agenda' ? `Waiting for agenda${taskSuffix}`
    : view === 'picking-waiting-project' ? `Waiting for project${taskSuffix}`
    : ''

  const showProject = view === 'dashboard' || view === 'tasks' || view === 'waiting' || view === 'pick-list'

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
