import { describe, it, expect } from 'vitest'
import { project, applyEvent, createEmptyState } from './projection.js'
import { buildStateFromConfig } from './config.js'
import type { PalimpsestEvent } from './events.js'
import type { SphereId, ProjectId, TaskId, EventId } from './ids.js'

function eventId(): EventId { return 'evt' as EventId }
function sphereId(): SphereId { return 'sph1' as SphereId }
function projectId(): ProjectId { return 'prj1' as ProjectId }
function taskId(): TaskId { return 'tsk1' as TaskId }

const BASE_TASK: PalimpsestEvent = {
  id: eventId(), type: 'task.created', taskId: taskId(),
  occurredAt: '2026-01-01T00:00:00.000Z',
  title: 'Write tests', description: '', sphereId: sphereId(),
}

describe('projection: tasks', () => {
  it('creates a task with open status', () => {
    const state = project([BASE_TASK])
    const task = state.tasks.get(taskId())
    expect(task?.status).toBe('open')
    expect(task?.title).toBe('Write tests')
  })

  it('completes a non-recurring task', () => {
    const state = project([
      BASE_TASK,
      { id: eventId(), type: 'task.completed', taskId: taskId(), occurredAt: '2026-01-02T00:00:00.000Z' },
    ])
    expect(state.tasks.get(taskId())?.status).toBe('completed')
  })

  it('task.completed is a no-op on a recurring task', () => {
    const events: PalimpsestEvent[] = [
      { ...BASE_TASK, dueDateExpression: 'daily', dueDate: '2026-01-02' },
      { id: eventId(), type: 'task.completed', taskId: taskId(), occurredAt: '2026-01-02T00:00:00.000Z' },
    ]
    const state = project(events)
    expect(state.tasks.get(taskId())?.status).toBe('open')
  })

  it('task.recurred updates due date and keeps task open', () => {
    const events: PalimpsestEvent[] = [
      { ...BASE_TASK, dueDateExpression: 'daily', dueDate: '2026-01-02' },
      {
        id: eventId(), type: 'task.recurred', taskId: taskId(),
        occurredAt: '2026-01-02T00:00:00.000Z',
        previousDueDate: '2026-01-02', newDueDate: '2026-01-03',
      },
    ]
    const state = project(events)
    const task = state.tasks.get(taskId())
    expect(task?.status).toBe('open')
    expect(task?.dueDate).toBe('2026-01-03')
    expect(task?.lastRecurredAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('task.recurred is a no-op on a non-recurring task', () => {
    const events: PalimpsestEvent[] = [
      BASE_TASK,
      {
        id: eventId(), type: 'task.recurred', taskId: taskId(),
        occurredAt: '2026-01-02T00:00:00.000Z',
        newDueDate: '2026-01-03',
      },
    ]
    const state = project(events)
    expect(state.tasks.get(taskId())?.lastRecurredAt).toBeUndefined()
  })

  it('soft-deletes a task', () => {
    const state = project([
      BASE_TASK,
      { id: eventId(), type: 'task.deleted', taskId: taskId(), occurredAt: '2026-01-02T00:00:00.000Z' },
    ])
    const task = state.tasks.get(taskId())
    expect(task?.status).toBe('deleted')
    expect(state.tasks.has(taskId())).toBe(true)
  })

  it('clears optional fields with CLEAR sentinel', () => {
    const events: PalimpsestEvent[] = [
      { ...BASE_TASK, dueDate: '2026-01-10' },
      {
        id: eventId(), type: 'task.updated', taskId: taskId(),
        occurredAt: '2026-01-02T00:00:00.000Z',
        patch: { dueDate: null },
      },
    ]
    const state = project(events)
    expect(state.tasks.get(taskId())?.dueDate).toBeUndefined()
  })
})

describe('projection: initialState', () => {
  it('seeds spheres from initialState', () => {
    const initialState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId(), name: 'Work', agendas: [], contexts: [] }]) }
    const state = project([], initialState)
    expect(state.spheres.get(sphereId())?.name).toBe('Work')
  })
})

describe('projection: unknown entity references', () => {
  it('ignores events for non-existent tasks', () => {
    const state = project([
      { id: eventId(), type: 'task.completed', taskId: 'nope' as TaskId, occurredAt: '2026-01-01T00:00:00.000Z' },
    ])
    expect(state.tasks.size).toBe(0)
  })

  it('silently skips unrecognised event types (e.g. removed sphere events)', () => {
    const oldSphereEvent = { id: eventId(), type: 'sphere.created', sphereId: sphereId(), name: 'Work', occurredAt: '2026-01-01T00:00:00.000Z' }
    const state = project([oldSphereEvent as unknown as PalimpsestEvent])
    expect(state.spheres.size).toBe(0)
    expect(state.tasks.size).toBe(0)
  })
})
