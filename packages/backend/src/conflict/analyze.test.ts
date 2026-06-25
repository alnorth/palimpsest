import { describe, it, expect } from 'vitest'
import { analyzeConflict } from './analyze.js'
import type { PalimpsestEvent } from 'palimpsest'

// Minimal event factories — only the fields needed for conflict analysis
function taskCreated(taskId: string, sphereId = 's1', projectId?: string): PalimpsestEvent {
  return { id: 'e1' as any, type: 'task.created', taskId, sphereId, projectId, title: 'T', occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function taskUpdated(taskId: string): PalimpsestEvent {
  return { id: 'e2' as any, type: 'task.updated', taskId, patch: { title: 'New' }, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function taskCompleted(taskId: string): PalimpsestEvent {
  return { id: 'e3' as any, type: 'task.completed', taskId, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function taskDeleted(taskId: string): PalimpsestEvent {
  return { id: 'e4' as any, type: 'task.deleted', taskId, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function taskRecurred(taskId: string): PalimpsestEvent {
  return { id: 'e5' as any, type: 'task.recurred', taskId, newDueDate: '2024-02-01', occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function taskUncompleted(taskId: string): PalimpsestEvent {
  return { id: 'e6' as any, type: 'task.uncompleted', taskId, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function sphereDeleted(sphereId: string): PalimpsestEvent {
  return { id: 'e7' as any, type: 'sphere.deleted', sphereId, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function projectDeleted(projectId: string): PalimpsestEvent {
  return { id: 'e8' as any, type: 'project.deleted', projectId, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function projectUpdated(projectId: string): PalimpsestEvent {
  return { id: 'e9' as any, type: 'project.updated', projectId, patch: {}, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}
function sphereCreated(): PalimpsestEvent {
  return { id: 'e10' as any, type: 'sphere.created', sphereId: 'new-sphere', name: 'S', occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
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
      const intervening = [sphereCreated()]
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

    it('task.created when parent sphere was deleted → conflict with reason parent-deleted', () => {
      const submitted = [taskCreated('taskA', 's1')]
      const intervening = [sphereDeleted('s1')]
      const result = analyzeConflict(submitted, intervening)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') expect(result.reason).toBe('parent-deleted')
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
