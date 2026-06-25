import type { TaskId, ProjectId, SphereId } from './ids.js'

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
  completedAt?: string
  lastRecurredAt?: string
}

export interface Project {
  id: ProjectId
  sphereId: SphereId
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface Sphere {
  id: SphereId
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}
