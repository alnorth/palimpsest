import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from './ids.js'

export type TaskStatus = 'open' | 'completed' | 'deleted'

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
  isNext?: boolean
  isStarred?: boolean
  completedAt?: string
  lastRecurredAt?: string
}

export interface Agenda {
  id: AgendaId
  sphereId: SphereId
  title: string
  createdAt: string
  updatedAt: string
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
  createdAt: string
  updatedAt: string
}

export interface Context {
  id: ContextId
  sphereId: SphereId
  name: string
  description?: string
  parentContextId?: ContextId
  createdAt: string
  updatedAt: string
}
