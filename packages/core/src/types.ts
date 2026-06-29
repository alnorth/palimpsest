import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from './ids.js'

export type TaskStatus = 'open' | 'completed' | 'deleted'

export type WaitingFor =
  | { kind: 'review' }
  | { kind: 'agenda'; agendaId: AgendaId }
  | { kind: 'project'; projectId: ProjectId }
  | { kind: 'trello'; cardUrl: string }

export interface Task {
  id: TaskId
  title: string
  description: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  projectId?: ProjectId
  sphereId?: SphereId
  dueDate?: string
  dueDateExpression?: string
  agendaId?: AgendaId
  contextId?: ContextId
  isNext?: true
  isStarred?: true
  waitingFor?: WaitingFor
  completedAt?: string
  lastRecurredAt?: string
}

export interface Agenda {
  id: AgendaId
  sphereId: SphereId
  title: string
  key?: string
}

export interface Project {
  id: ProjectId
  sphereId: SphereId
  name: string
  description?: string
  isArchived?: boolean
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface Sphere {
  id: SphereId
  name: string
  description?: string
}

export interface Context {
  id: ContextId
  sphereId: SphereId
  name: string
  description?: string
  key?: string
}
