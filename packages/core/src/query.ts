import type { Task, Project, Sphere, Agenda, Context, TaskStatus } from './types.js'
import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from './ids.js'
import type { ProjectionState } from './projection.js'

export function getTaskSphereId(state: ProjectionState, task: Task): SphereId | undefined {
  if (task.projectId !== undefined) {
    return state.projects.get(task.projectId)?.sphereId
  }
  return task.sphereId
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function getTask(state: ProjectionState, taskId: TaskId): Task | undefined {
  return state.tasks.get(taskId)
}

export interface TaskFilter {
  status?: TaskStatus
  projectId?: ProjectId
  sphereId?: SphereId
  agendaId?: AgendaId
  contextId?: ContextId
  isWaiting?: boolean
}

export function listTasks(state: ProjectionState, filter?: TaskFilter): Task[] {
  let tasks = [...state.tasks.values()]
  if (filter?.status    !== undefined) tasks = tasks.filter(t => t.status === filter.status)
  if (filter?.projectId !== undefined) tasks = tasks.filter(t => t.projectId === filter.projectId)
  if (filter?.agendaId  !== undefined) tasks = tasks.filter(t => t.agendaId  === filter.agendaId)
  if (filter?.contextId !== undefined) tasks = tasks.filter(t => t.contextId === filter.contextId)
  if (filter?.sphereId  !== undefined) {
    const sid = filter.sphereId
    tasks = tasks.filter(t => getTaskSphereId(state, t) === sid)
  }
  if (filter?.isWaiting !== undefined) tasks = tasks.filter(t => filter.isWaiting ? t.waitingFor !== undefined : t.waitingFor === undefined)
  return tasks
}

export function listOpenTasks(state: ProjectionState): Task[] {
  return listTasks(state, { status: 'open' })
}

export function listTasksByProject(state: ProjectionState, projectId: ProjectId): Task[] {
  return listTasks(state, { projectId, status: 'open' })
}

export function listTasksBySphere(state: ProjectionState, sphereId: SphereId): Task[] {
  return listTasks(state, { sphereId, status: 'open' })
}

export function listTasksByAgenda(state: ProjectionState, agendaId: AgendaId): Task[] {
  return listTasks(state, { agendaId, status: 'open' })
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function getProject(state: ProjectionState, projectId: ProjectId): Project | undefined {
  return state.projects.get(projectId)
}

export function listProjects(
  state: ProjectionState,
  filter?: { sphereId?: SphereId; isArchived?: boolean },
): Project[] {
  let projects = [...state.projects.values()]
  if (filter?.sphereId  !== undefined) projects = projects.filter(p => p.sphereId === filter.sphereId)
  if (filter?.isArchived !== undefined) {
    projects = filter.isArchived
      ? projects.filter(p => p.isArchived === true)
      : projects.filter(p => !p.isArchived)
  }
  return projects
}

// ── Agendas ───────────────────────────────────────────────────────────────────

export function getAgenda(state: ProjectionState, agendaId: AgendaId): Agenda | undefined {
  return state.agendas.get(agendaId)
}

export function listAgendas(state: ProjectionState, filter?: { sphereId?: SphereId }): Agenda[] {
  let agendas = [...state.agendas.values()]
  if (filter?.sphereId !== undefined) agendas = agendas.filter(a => a.sphereId === filter.sphereId)
  return agendas
}

// ── Contexts ──────────────────────────────────────────────────────────────────

export function getContext(state: ProjectionState, contextId: ContextId): Context | undefined {
  return state.contexts.get(contextId)
}

export function listContexts(
  state: ProjectionState,
  filter?: { sphereId?: SphereId },
): Context[] {
  let contexts = [...state.contexts.values()]
  if (filter?.sphereId !== undefined) contexts = contexts.filter(c => c.sphereId === filter.sphereId)
  return contexts
}

export function listTasksByContext(state: ProjectionState, contextId: ContextId): Task[] {
  return listTasks(state, { contextId, status: 'open' })
}

// ── Spheres ───────────────────────────────────────────────────────────────────

export function getSphere(state: ProjectionState, sphereId: SphereId): Sphere | undefined {
  return state.spheres.get(sphereId)
}

export function listSpheres(state: ProjectionState): Sphere[] {
  return [...state.spheres.values()]
}
