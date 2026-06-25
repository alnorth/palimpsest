import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import {
  createSphere, createProject, createTask, updateTask,
  completeTask, uncompleteTask, deleteTask, postponeTask, finishRecurringTask,
} from './commands.js'
import type { PalimpsestEvent } from './events.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'

function buildState(events: PalimpsestEvent[]) {
  return project(events)
}

describe('createSphere', () => {
  it('returns a sphere.created event', () => {
    const events = createSphere(createEmptyState(), { name: 'Work' })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('sphere.created')
  })
})

describe('createProject', () => {
  it('throws if sphere does not exist', () => {
    expect(() =>
      createProject(createEmptyState(), { sphereId: 'nope' as SphereId, name: 'My Project' })
    ).toThrow('Sphere not found')
  })

  it('creates a project when sphere exists', () => {
    const sphereEvents = createSphere(createEmptyState(), { name: 'Work' })
    const state = buildState(sphereEvents)
    const sphereId = (sphereEvents[0] as { sphereId: SphereId }).sphereId
    const events = createProject(state, { sphereId, name: 'My Project' })
    expect(events[0]?.type).toBe('project.created')
  })
})

describe('createTask', () => {
  it('throws if neither projectId nor sphereId is provided', () => {
    expect(() =>
      createTask(createEmptyState(), { title: 'No home' })
    ).toThrow('project or have a direct sphereId')
  })

  it('throws for invalid dueDateExpression', () => {
    const sphereEvents = createSphere(createEmptyState(), { name: 'Work' })
    const state = buildState(sphereEvents)
    const sphereId = (sphereEvents[0] as { sphereId: SphereId }).sphereId
    expect(() =>
      createTask(state, { title: 'Bad recurrence', sphereId, dueDateExpression: 'not-valid' })
    ).toThrow('Invalid dueDateExpression')
  })

  it('creates a task with valid inputs', () => {
    const sphereEvents = createSphere(createEmptyState(), { name: 'Work' })
    const state = buildState(sphereEvents)
    const sphereId = (sphereEvents[0] as { sphereId: SphereId }).sphereId
    const events = createTask(state, { title: 'Do the thing', sphereId })
    expect(events[0]?.type).toBe('task.created')
  })
})

describe('completeTask', () => {
  function setupTask(withRecurrence = false) {
    const sphereEvents = createSphere(createEmptyState(), { name: 'Work' })
    let state = buildState(sphereEvents)
    const sphereId = (sphereEvents[0] as { sphereId: SphereId }).sphereId
    const taskEvents = createTask(state, {
      title: 'Task',
      sphereId,
      dueDate: '2026-06-25',
      ...(withRecurrence && { dueDateExpression: 'every day' }),
    })
    state = buildState([...sphereEvents, ...taskEvents])
    const taskId = (taskEvents[0] as { taskId: TaskId }).taskId
    return { state, taskId }
  }

  it('produces task.completed for a non-recurring task', () => {
    const { state, taskId } = setupTask(false)
    const events = completeTask(state, taskId)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.completed')
  })

  it('produces task.recurred for a recurring task', () => {
    const { state, taskId } = setupTask(true)
    const events = completeTask(state, taskId)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.recurred')
  })

  it('throws if task is already completed', () => {
    const { state, taskId } = setupTask(false)
    const completedState = buildState([
      ...Object.values(state.spheres).map(s => ({
        id: 'x' as any, type: 'sphere.created' as const, sphereId: s.id, name: s.name, occurredAt: s.createdAt,
      })),
    ])
    // Directly test via projection
    const allEvents: PalimpsestEvent[] = []
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s2 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s2, { title: 'T', sphereId: sid, dueDate: '2026-06-25' })
    const s3 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const compEvts = completeTask(s3, tid)
    const s4 = buildState([...sphereEvts, ...taskEvts, ...compEvts])
    expect(() => completeTask(s4, tid)).toThrow('already completed')
  })

  it('throws if task does not exist', () => {
    expect(() =>
      completeTask(createEmptyState(), 'nope' as TaskId)
    ).toThrow('Task not found')
  })
})

describe('uncompleteTask', () => {
  it('restores a completed task to open', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid, dueDate: '2026-06-25' })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const compEvts = completeTask(s2, tid)
    const s3 = buildState([...sphereEvts, ...taskEvts, ...compEvts])
    const uncompEvts = uncompleteTask(s3, tid)
    const s4 = buildState([...sphereEvts, ...taskEvts, ...compEvts, ...uncompEvts])
    expect(s4.tasks.get(tid)?.status).toBe('open')
    expect(s4.tasks.get(tid)?.completedAt).toBeUndefined()
  })

  it('throws if task is not completed', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => uncompleteTask(s2, tid)).toThrow('not completed')
  })

  it('throws if task does not exist', () => {
    expect(() => uncompleteTask(createEmptyState(), 'nope' as TaskId)).toThrow('Task not found')
  })
})

describe('deleteTask', () => {
  it('throws if already deleted', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const delEvts = deleteTask(s2, tid)
    const s3 = buildState([...sphereEvts, ...taskEvts, ...delEvts])
    expect(() => deleteTask(s3, tid)).toThrow('already deleted')
  })
})

describe('updateTask', () => {
  function setup() {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { s2, tid }
  }

  it('throws for invalid dueDateExpression in patch', () => {
    const { s2, tid } = setup()
    expect(() =>
      updateTask(s2, { taskId: tid, patch: { dueDateExpression: 'bad-expr' } })
    ).toThrow('Invalid dueDateExpression')
  })

  it('auto-sets dueDate when expression is set and dueDate is not in patch', () => {
    const { s2, tid } = setup()
    const events = updateTask(s2, { taskId: tid, patch: { dueDateExpression: 'every monday' } })
    const patch = (events[0] as any).patch
    expect(patch.dueDateExpression).toBe('every monday')
    expect(typeof patch.dueDate).toBe('string')
  })

  it('does not override an explicit dueDate in the patch', () => {
    const { s2, tid } = setup()
    const events = updateTask(s2, { taskId: tid, patch: { dueDateExpression: 'every monday', dueDate: '2030-01-01' } })
    const patch = (events[0] as any).patch
    expect(patch.dueDate).toBe('2030-01-01')
  })
})

describe('createTask — auto-set dueDate from expression', () => {
  it('auto-sets dueDate when only expression is provided', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const events = createTask(s1, { title: 'T', sphereId: sid, dueDateExpression: 'every monday' })
    const event = events[0] as any
    expect(typeof event.dueDate).toBe('string')
    expect(event.dueDateExpression).toBe('every monday')
  })

  it('does not override an explicit dueDate', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const events = createTask(s1, { title: 'T', sphereId: sid, dueDateExpression: 'every monday', dueDate: '2030-01-01' })
    const event = events[0] as any
    expect(event.dueDate).toBe('2030-01-01')
  })
})

describe('postponeTask', () => {
  function setup() {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid, dueDate: '2026-06-25', dueDateExpression: 'every week' })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { s2, tid }
  }

  it('emits task.updated with a new dueDate', () => {
    const { s2, tid } = setup()
    const events = postponeTask(s2, tid)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.updated')
    const patch = (events[0] as any).patch
    expect(typeof patch.dueDate).toBe('string')
  })

  it('throws if task has no expression', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => postponeTask(s2, tid)).toThrow('no recurrence expression')
  })
})

describe('finishRecurringTask', () => {
  function setup() {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid, dueDateExpression: 'every week' })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { sphereEvts, taskEvts, s2, tid }
  }

  it('emits task.updated (clearing expression) then task.completed', () => {
    const { s2, tid } = setup()
    const events = finishRecurringTask(s2, tid)
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('task.updated')
    expect((events[0] as any).patch.dueDateExpression).toBeNull()
    expect(events[1]?.type).toBe('task.completed')
  })

  it('results in a completed task with no expression', () => {
    const { sphereEvts, taskEvts, s2, tid } = setup()
    const finishEvts = finishRecurringTask(s2, tid)
    const finalState = buildState([...sphereEvts, ...taskEvts, ...finishEvts])
    const task = finalState.tasks.get(tid)
    expect(task?.status).toBe('completed')
    expect(task?.dueDateExpression).toBeUndefined()
  })

  it('throws if task has no expression', () => {
    const sphereEvts = createSphere(createEmptyState(), { name: 'W' })
    const s1 = buildState(sphereEvts)
    const sid = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'T', sphereId: sid })
    const s2 = buildState([...sphereEvts, ...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => finishRecurringTask(s2, tid)).toThrow('no recurrence expression')
  })
})
