import type { TaskId, ProjectId, SphereId, AgendaId, ContextId, EventId } from './ids.js'
import type { WaitingFor } from './types.js'

export const CLEAR = null

interface EventBase {
  id: EventId
  occurredAt: string
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

// ── Task events ───────────────────────────────────────────────────────────────

export interface TaskCreatedEvent extends EventBase {
  type: 'task.created'
  taskId: TaskId
  title: string
  description: string
  projectId?: ProjectId
  sphereId?: SphereId
  agendaId?: AgendaId
  contextId?: ContextId
  isNext?: boolean
  isStarred?: boolean
  waitingFor?: WaitingFor
  dueDate?: string
  dueDateExpression?: string
}

export type TaskPatch = {
  title?: string
  description?: string
  projectId?: ProjectId | typeof CLEAR
  sphereId?: SphereId | typeof CLEAR
  agendaId?: AgendaId | typeof CLEAR
  contextId?: ContextId | typeof CLEAR
  isNext?: boolean
  isStarred?: boolean
  waitingFor?: WaitingFor | typeof CLEAR
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
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | ProjectArchivedEvent
  | ProjectUnarchivedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TaskUncompletedEvent
  | TaskRecurredEvent
  | TaskDeletedEvent
