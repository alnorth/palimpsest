import type { TaskId, ProjectId, SphereId, AgendaId, EventId } from './ids.js'

export const CLEAR = null

interface EventBase {
  id: EventId
  occurredAt: string
}

// ── Sphere events ─────────────────────────────────────────────────────────────

export interface SphereCreatedEvent extends EventBase {
  type: 'sphere.created'
  sphereId: SphereId
  name: string
  description?: string
}

export type SpherePatch = {
  name?: string
  description?: string | typeof CLEAR
}

export interface SphereUpdatedEvent extends EventBase {
  type: 'sphere.updated'
  sphereId: SphereId
  patch: SpherePatch
}

export interface SphereDeletedEvent extends EventBase {
  type: 'sphere.deleted'
  sphereId: SphereId
}

// ── Project events ────────────────────────────────────────────────────────────

export interface ProjectCreatedEvent extends EventBase {
  type: 'project.created'
  projectId: ProjectId
  sphereId: SphereId
  name: string
  description?: string
}

export type ProjectPatch = {
  name?: string
  description?: string | typeof CLEAR
  sphereId?: SphereId
}

export interface ProjectUpdatedEvent extends EventBase {
  type: 'project.updated'
  projectId: ProjectId
  patch: ProjectPatch
}

export interface ProjectDeletedEvent extends EventBase {
  type: 'project.deleted'
  projectId: ProjectId
}

export interface ProjectArchivedEvent extends EventBase {
  type: 'project.archived'
  projectId: ProjectId
}

export interface ProjectUnarchivedEvent extends EventBase {
  type: 'project.unarchived'
  projectId: ProjectId
}

// ── Agenda events ─────────────────────────────────────────────────────────────

export interface AgendaCreatedEvent extends EventBase {
  type: 'agenda.created'
  agendaId: AgendaId
  sphereId: SphereId
  title: string
}

export type AgendaPatch = {
  title?: string
}

export interface AgendaUpdatedEvent extends EventBase {
  type: 'agenda.updated'
  agendaId: AgendaId
  patch: AgendaPatch
}

export interface AgendaDeletedEvent extends EventBase {
  type: 'agenda.deleted'
  agendaId: AgendaId
}

// ── Task events ───────────────────────────────────────────────────────────────

export interface TaskCreatedEvent extends EventBase {
  type: 'task.created'
  taskId: TaskId
  title: string
  description: string
  projectId?: ProjectId
  sphereId?: SphereId
  agendaId?: AgendaId
  isNext?: boolean
  dueDate?: string
  dueDateExpression?: string
}

export type TaskPatch = {
  title?: string
  description?: string
  projectId?: ProjectId | typeof CLEAR
  sphereId?: SphereId | typeof CLEAR
  agendaId?: AgendaId | typeof CLEAR
  isNext?: boolean
  dueDate?: string | typeof CLEAR
  dueDateExpression?: string | typeof CLEAR
}

export interface TaskUpdatedEvent extends EventBase {
  type: 'task.updated'
  taskId: TaskId
  patch: TaskPatch
}

export interface TaskCompletedEvent extends EventBase {
  type: 'task.completed'
  taskId: TaskId
}

export interface TaskRecurredEvent extends EventBase {
  type: 'task.recurred'
  taskId: TaskId
  previousDueDate?: string
  newDueDate: string
}

export interface TaskUncompletedEvent extends EventBase {
  type: 'task.uncompleted'
  taskId: TaskId
}

export interface TaskDeletedEvent extends EventBase {
  type: 'task.deleted'
  taskId: TaskId
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type PalimpsestEvent =
  | SphereCreatedEvent
  | SphereUpdatedEvent
  | SphereDeletedEvent
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | ProjectArchivedEvent
  | ProjectUnarchivedEvent
  | AgendaCreatedEvent
  | AgendaUpdatedEvent
  | AgendaDeletedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TaskUncompletedEvent
  | TaskRecurredEvent
  | TaskDeletedEvent
