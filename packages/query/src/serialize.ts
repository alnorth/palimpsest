import type { Task, Project, Sphere, Agenda, Context, ProjectId, ProjectionState } from '@alnorth/palimpsest'
import { getTaskSphereId } from '@alnorth/palimpsest'

export interface EntityRef {
  id: string
  name: string
}

export type WaitingForJson =
  | { kind: 'review' }
  | { kind: 'agenda'; id: string; name: string | null }
  | { kind: 'project'; id: string; name: string | null }
  | { kind: 'trello'; cardUrl: string }
  | null

export interface TaskJson {
  id: string
  title: string
  description: string
  status: Task['status']
  sphere: EntityRef | null
  project: EntityRef | null
  agenda: EntityRef | null
  context: EntityRef | null
  dueDate: string | null
  recurrence: string | null
  isNext: boolean
  isStarred: boolean
  waitingFor: WaitingForJson
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ProjectJson {
  id: string
  name: string
  description: string | null
  sphere: EntityRef | null
  isArchived: boolean
  openTaskCount: number
  hasNextAction: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  nextTasks?: TaskJson[]
}

export interface SphereJson {
  id: string
  name: string
  description: string | null
}

export interface AgendaJson {
  id: string
  name: string
  sphere: EntityRef | null
}

export interface ContextJson {
  id: string
  name: string
  sphere: EntityRef | null
  description: string | null
}

export interface ProjectStats {
  openTaskCount: number
  hasNextAction: boolean
}

function refFromSphere(sphere: Sphere | undefined): EntityRef | null {
  return sphere !== undefined ? { id: sphere.id, name: sphere.name } : null
}

function refFromProject(project: Project | undefined): EntityRef | null {
  return project !== undefined ? { id: project.id, name: project.name } : null
}

function refFromAgenda(agenda: Agenda | undefined): EntityRef | null {
  return agenda !== undefined ? { id: agenda.id, name: agenda.title } : null
}

function refFromContext(context: Context | undefined): EntityRef | null {
  return context !== undefined ? { id: context.id, name: context.name } : null
}

function toWaitingForJson(state: ProjectionState, task: Task): WaitingForJson {
  const waitingFor = task.waitingFor
  if (waitingFor === undefined) return null
  switch (waitingFor.kind) {
    case 'review':
      return { kind: 'review' }
    case 'agenda': {
      const agenda = state.agendas.get(waitingFor.agendaId)
      return { kind: 'agenda', id: waitingFor.agendaId, name: agenda?.title ?? null }
    }
    case 'project': {
      const project = state.projects.get(waitingFor.projectId)
      return { kind: 'project', id: waitingFor.projectId, name: project?.name ?? null }
    }
    case 'trello':
      return { kind: 'trello', cardUrl: waitingFor.cardUrl }
  }
}

export function toTaskJson(state: ProjectionState, task: Task): TaskJson {
  const sphereId = getTaskSphereId(state, task)

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    sphere: sphereId !== undefined ? refFromSphere(state.spheres.get(sphereId)) : null,
    project: task.projectId !== undefined ? refFromProject(state.projects.get(task.projectId)) : null,
    agenda: task.agendaId !== undefined ? refFromAgenda(state.agendas.get(task.agendaId)) : null,
    context: task.contextId !== undefined ? refFromContext(state.contexts.get(task.contextId)) : null,
    dueDate: task.dueDate ?? null,
    recurrence: task.dueDateExpression ?? null,
    isNext: task.isNext === true,
    isStarred: task.isStarred === true,
    waitingFor: toWaitingForJson(state, task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt ?? null,
  }
}

export function computeProjectStats(state: ProjectionState): Map<ProjectId, ProjectStats> {
  const stats = new Map<ProjectId, ProjectStats>()
  for (const project of state.projects.values()) {
    stats.set(project.id, { openTaskCount: 0, hasNextAction: false })
  }
  for (const task of state.tasks.values()) {
    if (task.status !== 'open' || task.projectId === undefined) continue
    const projectStats = stats.get(task.projectId)
    if (projectStats === undefined) continue
    projectStats.openTaskCount += 1
    if (task.isNext === true) projectStats.hasNextAction = true
  }
  return stats
}

export function toProjectJson(
  state: ProjectionState,
  project: Project,
  stats: ProjectStats,
  nextTasks?: Task[],
): ProjectJson {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    sphere: refFromSphere(state.spheres.get(project.sphereId)),
    isArchived: project.isArchived === true,
    openTaskCount: stats.openTaskCount,
    hasNextAction: stats.hasNextAction,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt ?? null,
    ...(nextTasks !== undefined && { nextTasks: nextTasks.map(t => toTaskJson(state, t)) }),
  }
}

export function computeProjectNextTasks(state: ProjectionState): Map<ProjectId, Task[]> {
  const map = new Map<ProjectId, Task[]>()
  for (const task of state.tasks.values()) {
    if (task.status !== 'open' || task.projectId === undefined || task.isNext !== true) continue
    const existing = map.get(task.projectId)
    if (existing !== undefined) existing.push(task)
    else map.set(task.projectId, [task])
  }
  return map
}

export function computeProjectStatsAndNextTasks(state: ProjectionState): {
  stats: Map<ProjectId, ProjectStats>
  nextTasksByProject: Map<ProjectId, Task[]>
} {
  const stats = new Map<ProjectId, ProjectStats>()
  const nextTasksByProject = new Map<ProjectId, Task[]>()
  for (const project of state.projects.values()) {
    stats.set(project.id, { openTaskCount: 0, hasNextAction: false })
  }
  for (const task of state.tasks.values()) {
    if (task.status !== 'open' || task.projectId === undefined) continue
    const projectStats = stats.get(task.projectId)
    if (projectStats !== undefined) {
      projectStats.openTaskCount += 1
      if (task.isNext === true) projectStats.hasNextAction = true
    }
    if (task.isNext === true) {
      const existing = nextTasksByProject.get(task.projectId)
      if (existing !== undefined) existing.push(task)
      else nextTasksByProject.set(task.projectId, [task])
    }
  }
  return { stats, nextTasksByProject }
}

export function toSphereJson(sphere: Sphere): SphereJson {
  return {
    id: sphere.id,
    name: sphere.name,
    description: sphere.description ?? null,
  }
}

export function toAgendaJson(state: ProjectionState, agenda: Agenda): AgendaJson {
  return {
    id: agenda.id,
    name: agenda.title,
    sphere: refFromSphere(state.spheres.get(agenda.sphereId)),
  }
}

export function toContextJson(state: ProjectionState, context: Context): ContextJson {
  return {
    id: context.id,
    name: context.name,
    sphere: refFromSphere(state.spheres.get(context.sphereId)),
    description: context.description ?? null,
  }
}
