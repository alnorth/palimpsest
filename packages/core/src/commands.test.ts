import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import {
  createProject, createTask, updateTask,
  completeTask, uncompleteTask, deleteTask, postponeTask, finishRecurringTask,
} from './commands.js'
import type { PalimpsestEvent } from './events.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function buildState(events: PalimpsestEvent[]) {
  return project(events, baseState)
}

describe('createProject', () => {
  it('throws if sphere does not exist', () => {
    expect(() =>
      createProject(createEmptyState(), { sphereId: 'nope' as SphereId, name: 'My Project' })
    ).toThrow('Sphere not found')
  })

  it('creates a project when sphere exists', () => {
    const events = createProject(baseState, { sphereId, name: 'My Project' })
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
    expect(() =>
      createTask(baseState, { title: 'Bad recurrence', sphereId, dueDateExpression: 'not-valid' })
    ).toThrow('Invalid dueDateExpression')
  })

  it('creates a task with valid inputs', () => {
    const events = createTask(baseState, { title: 'Do the thing', sphereId })
    expect(events[0]?.type).toBe('task.created')
  })
})

describe('completeTask', () => {
  function setupTask(withRecurrence = false) {
    const taskEvents = createTask(baseState, {
      title: 'Task',
      sphereId,
      dueDate: '2026-06-25',
      ...(withRecurrence && { dueDateExpression: 'every day' }),
    })
    const state = buildState([...taskEvents])
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
    const taskEvts = createTask(baseState, { title: 'T', sphereId, dueDate: '2026-06-25' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const compEvts = completeTask(s1, tid)
    const s2 = buildState([...taskEvts, ...compEvts])
    expect(() => completeTask(s2, tid)).toThrow('already completed')
  })

  it('throws if task does not exist', () => {
    expect(() =>
      completeTask(createEmptyState(), 'nope' as TaskId)
    ).toThrow('Task not found')
  })
})

describe('uncompleteTask', () => {
  it('restores a completed task to open', () => {
    const taskEvts = createTask(baseState, { title: 'T', sphereId, dueDate: '2026-06-25' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const compEvts = completeTask(s1, tid)
    const s2 = buildState([...taskEvts, ...compEvts])
    const uncompEvts = uncompleteTask(s2, tid)
    const s3 = buildState([...taskEvts, ...compEvts, ...uncompEvts])
    expect(s3.tasks.get(tid)?.status).toBe('open')
    expect(s3.tasks.get(tid)?.completedAt).toBeUndefined()
  })

  it('throws if task is not completed', () => {
    const taskEvts = createTask(baseState, { title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => uncompleteTask(s1, tid)).toThrow('not completed')
  })

  it('throws if task does not exist', () => {
    expect(() => uncompleteTask(createEmptyState(), 'nope' as TaskId)).toThrow('Task not found')
  })
})

describe('deleteTask', () => {
  it('throws if already deleted', () => {
    const taskEvts = createTask(baseState, { title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const delEvts = deleteTask(s1, tid)
    const s2 = buildState([...taskEvts, ...delEvts])
    expect(() => deleteTask(s2, tid)).toThrow('already deleted')
  })
})

describe('updateTask', () => {
  function setup() {
    const taskEvts = createTask(baseState, { title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { s1, tid }
  }

  it('throws for invalid dueDateExpression in patch', () => {
    const { s1, tid } = setup()
    expect(() =>
      updateTask(s1, { taskId: tid, patch: { dueDateExpression: 'bad-expr' } })
    ).toThrow('Invalid dueDateExpression')
  })

  it('auto-sets dueDate when expression is set and dueDate is not in patch', () => {
    const { s1, tid } = setup()
    const events = updateTask(s1, { taskId: tid, patch: { dueDateExpression: 'every monday' } })
    const patch = (events[0] as any).patch
    expect(patch.dueDateExpression).toBe('every monday')
    expect(typeof patch.dueDate).toBe('string')
  })

  it('does not override an explicit dueDate in the patch', () => {
    const { s1, tid } = setup()
    const events = updateTask(s1, { taskId: tid, patch: { dueDateExpression: 'every monday', dueDate: '2030-01-01' } })
    const patch = (events[0] as any).patch
    expect(patch.dueDate).toBe('2030-01-01')
  })
})

describe('createTask — auto-set dueDate from expression', () => {
  it('auto-sets dueDate when only expression is provided', () => {
    const events = createTask(baseState, { title: 'T', sphereId, dueDateExpression: 'every monday' })
    const event = events[0] as any
    expect(typeof event.dueDate).toBe('string')
    expect(event.dueDateExpression).toBe('every monday')
  })

  it('does not override an explicit dueDate', () => {
    const events = createTask(baseState, { title: 'T', sphereId, dueDateExpression: 'every monday', dueDate: '2030-01-01' })
    const event = events[0] as any
    expect(event.dueDate).toBe('2030-01-01')
  })
})

describe('postponeTask', () => {
  function setup() {
    const taskEvts = createTask(baseState, { title: 'T', sphereId, dueDate: '2026-06-25', dueDateExpression: 'every week' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { taskEvts, s1, tid }
  }

  it('emits task.updated with a new dueDate', () => {
    const { s1, tid } = setup()
    const events = postponeTask(s1, tid)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.updated')
    const patch = (events[0] as any).patch
    expect(typeof patch.dueDate).toBe('string')
  })

  it('throws if task has no expression', () => {
    const taskEvts = createTask(baseState, { title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => postponeTask(s1, tid)).toThrow('no recurrence expression')
  })
})

describe('finishRecurringTask', () => {
  function setup() {
    const taskEvts = createTask(baseState, { title: 'T', sphereId, dueDateExpression: 'every week' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    return { taskEvts, s1, tid }
  }

  it('emits task.updated (clearing expression) then task.completed', () => {
    const { s1, tid } = setup()
    const events = finishRecurringTask(s1, tid)
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('task.updated')
    expect((events[0] as any).patch.dueDateExpression).toBeNull()
    expect(events[1]?.type).toBe('task.completed')
  })

  it('results in a completed task with no expression', () => {
    const { taskEvts, s1, tid } = setup()
    const finishEvts = finishRecurringTask(s1, tid)
    const finalState = buildState([...taskEvts, ...finishEvts])
    const task = finalState.tasks.get(tid)
    expect(task?.status).toBe('completed')
    expect(task?.dueDateExpression).toBeUndefined()
  })

  it('throws if task has no expression', () => {
    const taskEvts = createTask(baseState, { title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    expect(() => finishRecurringTask(s1, tid)).toThrow('no recurrence expression')
  })
})

describe('create project and assign task in same batch', () => {
  it('produces correct final state when all events are replayed together', () => {
    const taskEvts = createTask(baseState, { title: 'My task', sphereId })
    const s1 = buildState(taskEvts)
    const taskId = (taskEvts[0] as any).taskId as TaskId

    const projectEvts = createProject(s1, { name: 'New project', sphereId })
    const s2 = project(projectEvts, s1)
    const projectId = (projectEvts[0] as any).projectId as ProjectId

    const assignEvts = updateTask(s2, { taskId, patch: { projectId, sphereId: null } })

    const finalState = buildState([...taskEvts, ...projectEvts, ...assignEvts])
    expect(finalState.tasks.get(taskId)?.projectId).toBe(projectId)
    expect(finalState.tasks.get(taskId)?.sphereId).toBeUndefined()
    expect(finalState.projects.get(projectId)?.name).toBe('New project')
  })

  it('throws if updateTask is called against state that does not yet include the new project', () => {
    const taskEvts = createTask(baseState, { title: 'My task', sphereId })
    const s1 = buildState(taskEvts)
    const taskId = (taskEvts[0] as any).taskId as TaskId

    const projectEvts = createProject(s1, { name: 'New project', sphereId })
    const projectId = (projectEvts[0] as any).projectId as ProjectId

    expect(() =>
      updateTask(s1, { taskId, patch: { projectId, sphereId: null } })
    ).toThrow('Project not found')
  })
})
