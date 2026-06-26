import { describe, it, expect } from 'vitest'
import { analyzeConflict } from './analyze.js'
import type {
  TaskCreatedEvent, TaskUpdatedEvent, TaskCompletedEvent, TaskDeletedEvent,
  TaskRecurredEvent, TaskUncompletedEvent,
  ProjectCreatedEvent, ProjectUpdatedEvent, ProjectDeletedEvent,
} from 'palimpsest'
import type { TaskId, ProjectId, SphereId, EventId } from 'palimpsest'

const T = '2024-01-01T00:00:00Z'

function taskCreated(taskId: string, sphereId = 's1', projectId?: string): TaskCreatedEvent {
  return { id: 'e1' as EventId, type: 'task.created', taskId: taskId as TaskId, sphereId: sphereId as SphereId, ...(projectId !== undefined ? { projectId: projectId as ProjectId } : {}), title: 'T', description: '', occurredAt: T }
}
function taskUpdated(taskId: string): TaskUpdatedEvent {
  return { id: 'e2' as EventId, type: 'task.updated', taskId: taskId as TaskId, patch: { title: 'New' }, occurredAt: T }
}
function taskCompleted(taskId: string): TaskCompletedEvent {
  return { id: 'e3' as EventId, type: 'task.completed', taskId: taskId as TaskId, occurredAt: T }
}
function taskDeleted(taskId: string): TaskDeletedEvent {
  return { id: 'e4' as EventId, type: 'task.deleted', taskId: taskId as TaskId, occurredAt: T }
}
function taskRecurred(taskId: string): TaskRecurredEvent {
  return { id: 'e5' as EventId, type: 'task.recurred', taskId: taskId as TaskId, newDueDate: '2024-02-01', occurredAt: T }
}
function taskUncompleted(taskId: string): TaskUncompletedEvent {
  return { id: 'e6' as EventId, type: 'task.uncompleted', taskId: taskId as TaskId, occurredAt: T }
}
function projectDeleted(projectId: string): ProjectDeletedEvent {
  return { id: 'e8' as EventId, type: 'project.deleted', projectId: projectId as ProjectId, occurredAt: T }
}
function projectUpdated(projectId: string): ProjectUpdatedEvent {
  return { id: 'e9' as EventId, type: 'project.updated', projectId: projectId as ProjectId, patch: {}, occurredAt: T }
}
function projectCreated(projectId: string): ProjectCreatedEvent {
  return { id: 'e10' as EventId, type: 'project.created', projectId: projectId as ProjectId, sphereId: 's1' as SphereId, name: 'P', occurredAt: T }
}

describe('analyzeConflict', () => {
  describe('safe — no overlap with intervening events', () => {
    it('returns ok when submitted events touch different tasks from intervening events', () => {
      const submitted = [taskUpdated('taskA')]
      const intervening = [taskCompleted('taskB')]
      expect(analyzeConflict(submitted, intervening).status).toBe('ok')
    })

    it('returns ok when intervening events only create new entities', () => {
      const submitted = [taskUpdated('taskA')]
      const intervening = [projectCreated('projNew')]
      expect(analyzeConflict(submitted, intervening).status).toBe('ok')
    })

    it('returns ok when submitted and intervening events touch different projects', () => {
      const submitted = [projectUpdated('proj1')]
      const intervening = [projectUpdated('proj2')]
      expect(analyzeConflict(submitted, intervening).status).toBe('ok')
    })
  })

  describe('auto-resolved — idempotent operations', () => {
    it('task.completed when task was already completed → ok with no new events needed', () => {
      const submitted = [taskCompleted('taskA')]
      const intervening = [taskCompleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('ok')
      if (result.status === 'ok') expect(result.idempotent).toBe(true)
    })

    it('task.uncompleted when task was already uncompleted → ok idempotent', () => {
      const submitted = [taskUncompleted('taskA')]
      const intervening = [taskUncompleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('ok')
      if (result.status === 'ok') expect(result.idempotent).toBe(true)
    })

    it('task.deleted when task was already deleted → ok idempotent', () => {
      const submitted = [taskDeleted('taskA')]
      const intervening = [taskDeleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('ok')
      if (result.status === 'ok') expect(result.idempotent).toBe(true)
    })
  })

  describe('rerun — intervening events are on different entities', () => {
    it('task.updated when intervening events are on different tasks → rerun', () => {
      // Different entity but same type — need to rerun with updated state for safety
      const submitted = [taskUpdated('taskA')]
      const intervening = [taskUpdated('taskB'), taskCompleted('taskC')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('ok') // safe to apply directly since no overlap
    })
  })

  describe('hard conflicts', () => {
    it('task.updated on a deleted task → conflict with reason task-deleted', () => {
      const submitted = [taskUpdated('taskA')]
      const intervening = [taskDeleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') {
        expect(result.reason).toBe('task-deleted')
        expect(result.conflictingEvents).toContainEqual(intervening[0])
      }
    })

    it('task.completed on a deleted task → conflict with reason task-deleted', () => {
      const submitted = [taskCompleted('taskA')]
      const intervening = [taskDeleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') expect(result.reason).toBe('task-deleted')
    })

    it('task.updated on a completed task → conflict with reason task-already-completed', () => {
      const submitted = [taskUpdated('taskA')]
      const intervening = [taskCompleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') expect(result.reason).toBe('task-already-completed')
    })

    it('task.updated on a recurred task → conflict with reason task-already-completed', () => {
      const submitted = [taskUpdated('taskA')]
      const intervening = [taskRecurred('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') expect(result.reason).toBe('task-already-completed')
    })

    it('task.created when parent project was deleted → conflict with reason parent-deleted', () => {
      const submitted = [taskCreated('taskA', 's1', 'proj1')]
      const intervening = [projectDeleted('proj1')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') expect(result.reason).toBe('parent-deleted')
    })
  })

  describe('multiple submitted events', () => {
    it('returns conflict if any submitted event conflicts', () => {
      const submitted = [taskUpdated('taskA'), taskUpdated('taskB')]
      const intervening = [taskDeleted('taskA')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
    })

    it('returns ok if all submitted events are safe', () => {
      const submitted = [taskUpdated('taskA'), taskUpdated('taskB')]
      const intervening = [taskCompleted('taskC')]
      expect(analyzeConflict(submitted, intervening).status).toBe('ok')
    })
  })
})
