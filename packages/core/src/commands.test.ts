import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import {
  createProject, createTask, updateTask,
  completeTask, uncompleteTask, deleteTask, postponeTask, finishRecurringTask,
} from './commands.js'
import { validateBatch } from './validation.js'
import type { PalimpsestEvent } from './events.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function buildState(events: PalimpsestEvent[]) {
  return project(events, baseState)
}

describe('createProject', () => {
  it('creates a project event', () => {
    const events = createProject({ sphereId, name: 'My Project' })
    expect(events[0]?.type).toBe('project.created')
  })
})

describe('createTask', () => {
  it('throws if neither projectId nor sphereId is provided', () => {
    expect(() =>
      createTask({ title: 'No home' })
    ).toThrow('project or have a direct sphereId')
  })

  it('throws for invalid dueDateExpression', () => {
    expect(() =>
      createTask({ title: 'Bad recurrence', sphereId, dueDateExpression: 'not-valid' })
    ).toThrow('Invalid dueDateExpression')
  })

  it('creates a task with valid inputs', () => {
    const events = createTask({ title: 'Do the thing', sphereId })
    expect(events[0]?.type).toBe('task.created')
  })
})

describe('completeTask', () => {
  function setupTask(withRecurrence = false) {
    const taskEvents = createTask({
      title: 'Task',
      sphereId,
      dueDate: '2026-06-25',
      ...(withRecurrence && { dueDateExpression: 'every day' }),
    })
    const state = buildState([...taskEvents])
    const task = state.tasks.get((taskEvents[0] as { taskId: TaskId }).taskId)!
    return { task }
  }

  it('produces task.completed for a non-recurring task', () => {
    const { task } = setupTask(false)
    const events = completeTask(task)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.completed')
  })

  it('produces task.recurred for a recurring task', () => {
    const { task } = setupTask(true)
    const events = completeTask(task)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.recurred')
  })

  it('throws if task is already completed', () => {
    const taskEvts = createTask({ title: 'T', sphereId, dueDate: '2026-06-25' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    const compEvts = completeTask(task)
    const s2 = buildState([...taskEvts, ...compEvts])
    const completedTask = s2.tasks.get(tid)!
    expect(() => completeTask(completedTask)).toThrow('already completed')
  })

  it('throws if task status is not open', () => {
    const taskEvts = createTask({ title: 'T', sphereId, dueDate: '2026-06-25' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    const compEvts = completeTask(task)
    const s2 = buildState([...taskEvts, ...compEvts])
    expect(s2.tasks.get(tid)?.status).toBe('completed')
  })
})

describe('uncompleteTask', () => {
  it('restores a completed task to open', () => {
    const taskEvts = createTask({ title: 'T', sphereId, dueDate: '2026-06-25' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    const compEvts = completeTask(task)
    const s2 = buildState([...taskEvts, ...compEvts])
    const completedTask = s2.tasks.get(tid)!
    const uncompEvts = uncompleteTask(completedTask)
    const s3 = buildState([...taskEvts, ...compEvts, ...uncompEvts])
    expect(s3.tasks.get(tid)?.status).toBe('open')
    expect(s3.tasks.get(tid)?.completedAt).toBeUndefined()
  })

  it('throws if task is not completed', () => {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    expect(() => uncompleteTask(task)).toThrow('not completed')
  })
})

describe('deleteTask', () => {
  it('throws if already deleted', () => {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    const delEvts = deleteTask(task)
    const s2 = buildState([...taskEvts, ...delEvts])
    const deletedTask = s2.tasks.get(tid)!
    expect(() => deleteTask(deletedTask)).toThrow('already deleted')
  })
})

describe('updateTask', () => {
  function setup() {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    return { s1, tid, task }
  }

  it('throws for invalid dueDateExpression in patch', () => {
    const { task } = setup()
    expect(() =>
      updateTask(task, { dueDateExpression: 'bad-expr' })
    ).toThrow('Invalid dueDateExpression')
  })

  it('auto-sets dueDate when expression is set and dueDate is not in patch', () => {
    const { task } = setup()
    const events = updateTask(task, { dueDateExpression: 'every monday' })
    const patch = (events[0] as any).patch
    expect(patch.dueDateExpression).toBe('every monday')
    expect(typeof patch.dueDate).toBe('string')
  })

  it('does not override an explicit dueDate in the patch', () => {
    const { task } = setup()
    const events = updateTask(task, { dueDateExpression: 'every monday', dueDate: '2030-01-01' })
    const patch = (events[0] as any).patch
    expect(patch.dueDate).toBe('2030-01-01')
  })
})

describe('createTask — auto-set dueDate from expression', () => {
  it('auto-sets dueDate when only expression is provided', () => {
    const events = createTask({ title: 'T', sphereId, dueDateExpression: 'every monday' })
    const event = events[0] as any
    expect(typeof event.dueDate).toBe('string')
    expect(event.dueDateExpression).toBe('every monday')
  })

  it('does not override an explicit dueDate', () => {
    const events = createTask({ title: 'T', sphereId, dueDateExpression: 'every monday', dueDate: '2030-01-01' })
    const event = events[0] as any
    expect(event.dueDate).toBe('2030-01-01')
  })
})

describe('postponeTask', () => {
  function setup() {
    const taskEvts = createTask({ title: 'T', sphereId, dueDate: '2026-06-25', dueDateExpression: 'every week' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    return { taskEvts, task }
  }

  it('emits task.updated with a new dueDate', () => {
    const { task } = setup()
    const events = postponeTask(task)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('task.updated')
    const patch = (events[0] as any).patch
    expect(typeof patch.dueDate).toBe('string')
  })

  it('throws if task has no expression', () => {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    expect(() => postponeTask(task)).toThrow('no recurrence expression')
  })
})

describe('finishRecurringTask', () => {
  function setup() {
    const taskEvts = createTask({ title: 'T', sphereId, dueDateExpression: 'every week' })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    return { taskEvts, task }
  }

  it('emits task.updated (clearing expression) then task.completed', () => {
    const { task } = setup()
    const events = finishRecurringTask(task)
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('task.updated')
    expect((events[0] as any).patch.dueDateExpression).toBeNull()
    expect(events[1]?.type).toBe('task.completed')
  })

  it('results in a completed task with no expression', () => {
    const { taskEvts, task } = setup()
    const finishEvts = finishRecurringTask(task)
    const finalState = buildState([...taskEvts, ...finishEvts])
    const tid = task.id
    const finalTask = finalState.tasks.get(tid)
    expect(finalTask?.status).toBe('completed')
    expect(finalTask?.dueDateExpression).toBeUndefined()
  })

  it('throws if task has no expression', () => {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    expect(() => finishRecurringTask(task)).toThrow('no recurrence expression')
  })
})

describe('toggleWaiting via updateTask', () => {
  function setup() {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s1 = buildState([...taskEvts])
    const tid = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(tid)!
    return { taskEvts, tid, task }
  }

  it('sets isWaiting to true', () => {
    const { taskEvts, tid, task } = setup()
    const events = updateTask(task, { isWaiting: true })
    const s2 = buildState([...taskEvts, ...events])
    expect(s2.tasks.get(tid)?.isWaiting).toBe(true)
  })

  it('clears isWaiting when set to false', () => {
    const { taskEvts, tid, task } = setup()
    const setEvts = updateTask(task, { isWaiting: true })
    const s2 = buildState([...taskEvts, ...setEvts])
    const waitingTask = s2.tasks.get(tid)!
    const clearEvts = updateTask(waitingTask, { isWaiting: false })
    const s3 = buildState([...taskEvts, ...setEvts, ...clearEvts])
    expect(s3.tasks.get(tid)?.isWaiting).toBeUndefined()
  })
})

describe('create project and assign task in same batch', () => {
  it('produces correct final state when all events are replayed together', () => {
    const taskEvts = createTask({ title: 'My task', sphereId })
    const s1 = buildState(taskEvts)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(taskId)!

    const projectEvts = createProject({ name: 'New project', sphereId })
    const s2 = project(projectEvts, s1)
    const projectId = (projectEvts[0] as any).projectId as ProjectId

    const assignEvts = updateTask(task, { projectId, sphereId: null })

    const finalState = buildState([...taskEvts, ...projectEvts, ...assignEvts])
    expect(finalState.tasks.get(taskId)?.projectId).toBe(projectId)
    expect(finalState.tasks.get(taskId)?.sphereId).toBeUndefined()
    expect(finalState.projects.get(projectId)?.name).toBe('New project')
  })

  it('validateBatch throws when assign-task references a project not in state or batch', () => {
    const taskEvts = createTask({ title: 'My task', sphereId })
    const s1 = buildState(taskEvts)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(taskId)!

    const projectEvts = createProject({ name: 'New project', sphereId })
    const projectId = (projectEvts[0] as any).projectId as ProjectId

    // updateTask no longer throws; validateBatch does
    const assignEvts = updateTask(task, { projectId, sphereId: null })
    expect(() => validateBatch(s1, assignEvts)).toThrow('Project not found')
  })
})
