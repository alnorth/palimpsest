import type { ProjectionState, Task, TaskFilter, TaskId, TaskStatus } from '@alnorth/palimpsest'
import { getTask, listTasks, listProjects, listAgendas, listContexts, listSpheres } from '@alnorth/palimpsest'
import { resolveSphere, resolveProject, resolveAgenda, resolveContext } from './resolve'
import {
  toTaskJson, toProjectJson, toSphereJson, toAgendaJson, toContextJson, computeProjectStats,
} from './serialize'
import { dashboardTasks, processingBuckets, waitingGroups, pickListGroups } from './views'

export type StatusArg = 'open' | 'completed' | 'deleted' | 'any'

export interface TasksCommand {
  kind: 'tasks'
  status?: StatusArg
  sphere?: string
  project?: string
  agenda?: string
  context?: string
  starred?: boolean
  actionable?: boolean
  waiting?: boolean
  notWaiting?: boolean
  noProject?: boolean
  dueOn?: string
  dueBefore?: string
  hasDueDate?: boolean
  withoutDueDate?: boolean
  hasAgenda?: boolean
  withoutAgenda?: boolean
  hasContext?: boolean
  withoutContext?: boolean
  includeArchived?: boolean
  limit?: number
}

export interface TaskCommand {
  kind: 'task'
  id: string
}

export interface ProjectsCommand {
  kind: 'projects'
  sphere?: string
  archived?: boolean
  all?: boolean
}

export interface SpheresCommand {
  kind: 'spheres'
}

export interface AgendasCommand {
  kind: 'agendas'
  sphere?: string
}

export interface ContextsCommand {
  kind: 'contexts'
  sphere?: string
}

export interface DashboardCommand {
  kind: 'dashboard'
  sphere: string
  limit?: number
}

export interface ProcessingCommand {
  kind: 'processing'
}

export interface WaitingCommand {
  kind: 'waiting'
  sphere?: string
}

export interface PickListCommand {
  kind: 'pick_list'
  sphere: string
}

export type ParsedCommand =
  | TasksCommand | TaskCommand | ProjectsCommand | SpheresCommand | AgendasCommand | ContextsCommand
  | DashboardCommand | ProcessingCommand | WaitingCommand | PickListCommand

export interface RunQueryOptions {
  today?: string
}

function paginate<T>(items: T[], limit: number | undefined): { count: number; total: number; truncated: boolean; items: T[] } {
  const total = items.length
  const sliced = limit !== undefined ? items.slice(0, limit) : items
  return { count: sliced.length, total, truncated: limit !== undefined && limit < total, items: sliced }
}

function resolveDateArg(value: string, today: string): string {
  return value === 'today' ? today : value
}

function defaultToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sortTasks(tasks: Task[], effectiveStatus: StatusArg): Task[] {
  const sorted = [...tasks]
  if (effectiveStatus === 'completed') {
    sorted.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return sorted
  }
  sorted.sort((a, b) => {
    const aDue = a.dueDate ?? '￿'
    const bDue = b.dueDate ?? '￿'
    if (aDue !== bDue) return aDue < bDue ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function runTasksQuery(state: ProjectionState, command: TasksCommand, today: string): Record<string, unknown> {
  const effectiveStatus = command.status ?? 'open'
  const sphereId = command.sphere !== undefined ? resolveSphere(state, command.sphere) : undefined
  const projectId = command.project !== undefined ? resolveProject(state, command.project, sphereId) : undefined
  const agendaId = command.agenda !== undefined ? resolveAgenda(state, command.agenda, sphereId) : undefined
  const contextId = command.context !== undefined ? resolveContext(state, command.context, sphereId) : undefined

  const filter: TaskFilter = {
    ...(effectiveStatus !== 'any' && { status: effectiveStatus as TaskStatus }),
    ...(sphereId !== undefined && { sphereId }),
    ...(projectId !== undefined && { projectId }),
    ...(agendaId !== undefined && { agendaId }),
    ...(contextId !== undefined && { contextId }),
    ...(command.starred === true && { isStarred: true }),
    ...(command.actionable === true && { isActionable: true }),
    ...(command.waiting === true && { isWaiting: true }),
    ...(command.notWaiting === true && { isWaiting: false }),
    ...(command.noProject === true && { hasProject: false }),
    ...(command.hasDueDate === true && { hasDueDate: true }),
    ...(command.withoutDueDate === true && { hasDueDate: false }),
    ...(command.hasAgenda === true && { hasAgenda: true }),
    ...(command.withoutAgenda === true && { hasAgenda: false }),
    ...(command.hasContext === true && { hasContext: true }),
    ...(command.withoutContext === true && { hasContext: false }),
    ...(command.includeArchived === true && { showArchivedProjects: true }),
  }

  let tasks = listTasks(state, filter)

  if (command.dueOn !== undefined) {
    const target = resolveDateArg(command.dueOn, today)
    tasks = tasks.filter(t => t.dueDate === target)
  }
  if (command.dueBefore !== undefined) {
    const target = resolveDateArg(command.dueBefore, today)
    tasks = tasks.filter(t => t.dueDate !== undefined && t.dueDate < target)
  }

  tasks = sortTasks(tasks, effectiveStatus)

  const { count, total, truncated, items } = paginate(tasks, command.limit)
  return { count, total, truncated, tasks: items.map(t => toTaskJson(state, t)) }
}

function runTaskQuery(state: ProjectionState, command: TaskCommand): Record<string, unknown> {
  const task = getTask(state, command.id as TaskId)
  if (task === undefined) throw new Error(`No task with id "${command.id}".`)
  return { task: toTaskJson(state, task) }
}

function runProjectsQuery(state: ProjectionState, command: ProjectsCommand): Record<string, unknown> {
  const sphereId = command.sphere !== undefined ? resolveSphere(state, command.sphere) : undefined
  const filter = {
    ...(sphereId !== undefined && { sphereId }),
    ...(command.all !== true && { isArchived: command.archived === true }),
  }
  const projects = sortByName(listProjects(state, filter))
  const stats = computeProjectStats(state)
  const { count, total, truncated, items } = paginate(projects, undefined)
  return {
    count, total, truncated,
    projects: items.map(p => toProjectJson(state, p, stats.get(p.id) ?? { openTaskCount: 0, hasNextAction: false })),
  }
}

function runSpheresQuery(state: ProjectionState): Record<string, unknown> {
  const spheres = sortByName(listSpheres(state))
  const { count, total, truncated, items } = paginate(spheres, undefined)
  return { count, total, truncated, spheres: items.map(toSphereJson) }
}

function runAgendasQuery(state: ProjectionState, command: AgendasCommand): Record<string, unknown> {
  const sphereId = command.sphere !== undefined ? resolveSphere(state, command.sphere) : undefined
  const agendas = listAgendas(state, sphereId !== undefined ? { sphereId } : undefined)
  const sorted = [...agendas].sort((a, b) => a.title.localeCompare(b.title))
  const { count, total, truncated, items } = paginate(sorted, undefined)
  return { count, total, truncated, agendas: items.map(a => toAgendaJson(state, a)) }
}

function runContextsQuery(state: ProjectionState, command: ContextsCommand): Record<string, unknown> {
  const sphereId = command.sphere !== undefined ? resolveSphere(state, command.sphere) : undefined
  const contexts = sortByName(listContexts(state, sphereId !== undefined ? { sphereId } : undefined))
  const { count, total, truncated, items } = paginate(contexts, undefined)
  return { count, total, truncated, contexts: items.map(c => toContextJson(state, c)) }
}

function runDashboardQuery(state: ProjectionState, command: DashboardCommand, today: string): Record<string, unknown> {
  const sphereId = resolveSphere(state, command.sphere)
  const tasks = dashboardTasks(state, sphereId, today)
  const { count, total, truncated, items } = paginate(tasks, command.limit)
  return { count, total, truncated, tasks: items.map(t => toTaskJson(state, t)) }
}

function runProcessingQuery(state: ProjectionState): Record<string, unknown> {
  const { actionableTasks, projectsWithoutNext, tasksWaitingOnArchivedProjects } = processingBuckets(state)
  const stats = computeProjectStats(state)
  return {
    actionableTasks: actionableTasks.map(t => toTaskJson(state, t)),
    projectsWithoutNext: projectsWithoutNext.map(p =>
      toProjectJson(state, p, stats.get(p.id) ?? { openTaskCount: 0, hasNextAction: false })),
    tasksWaitingOnArchivedProjects: tasksWaitingOnArchivedProjects.map(t => toTaskJson(state, t)),
  }
}

function runWaitingQuery(state: ProjectionState, command: WaitingCommand): Record<string, unknown> {
  const sphereId = command.sphere !== undefined ? resolveSphere(state, command.sphere) : undefined
  const groups = waitingGroups(state, sphereId).map(g => ({
    kind: g.kind, tasks: g.tasks.map(t => toTaskJson(state, t)),
  }))
  return { groups }
}

function runPickListQuery(state: ProjectionState, command: PickListCommand): Record<string, unknown> {
  const sphereId = resolveSphere(state, command.sphere)
  const groups = pickListGroups(state, sphereId).map(g => ({
    context: { id: g.context.id, name: g.context.name },
    tasks: g.tasks.map(t => toTaskJson(state, t)),
  }))
  return { groups }
}

export function runQuery(state: ProjectionState, command: ParsedCommand, opts: RunQueryOptions = {}): Record<string, unknown> {
  const today = opts.today ?? defaultToday()
  switch (command.kind) {
    case 'tasks': return runTasksQuery(state, command, today)
    case 'task': return runTaskQuery(state, command)
    case 'projects': return runProjectsQuery(state, command)
    case 'spheres': return runSpheresQuery(state)
    case 'agendas': return runAgendasQuery(state, command)
    case 'contexts': return runContextsQuery(state, command)
    case 'dashboard': return runDashboardQuery(state, command, today)
    case 'processing': return runProcessingQuery(state)
    case 'waiting': return runWaitingQuery(state, command)
    case 'pick_list': return runPickListQuery(state, command)
  }
}
