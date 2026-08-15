import { describe, test, expect, vi } from 'vitest'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { applyEvent, cloneState, nextDueDate } from '@alnorth/palimpsest'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './testFixtures'
import type { TaskStore } from './tools'
import {
  handleTasks, handleTask, handleProjects, handleSpheres, handleAgendas, handleContexts,
  handleDashboard, handleProcessing, handleWaiting, handlePickList, handleSearch,
  handleCompleteTask, handleSetDueDate, handleDeleteTask,
} from './tools'

function fakeStore(state: ProjectionState): TaskStore & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    sync: vi.fn(async () => { calls.push('sync') }),
    getState: vi.fn(async () => { calls.push('getState'); return state }),
    appendEvents: vi.fn(async () => { calls.push('appendEvents') }),
  }
}

// A fake store whose appendEvents actually folds events into its state via the real projection
// (mirroring how the real TodoistStore's pending-event queue is folded into every getState()
// call), so a completed task is visible to the second getState() a write handler makes after
// appending. getState() clones so each call returns a fresh reference, same as project()-backed
// stores do in production.
function mutableFakeStore(initial: ProjectionState): TaskStore & { calls: string[]; appended: PalimpsestEvent[][] } {
  const state = initial
  const calls: string[] = []
  const appended: PalimpsestEvent[][] = []
  return {
    calls,
    appended,
    sync: vi.fn(async () => { calls.push('sync') }),
    getState: vi.fn(async () => { calls.push('getState'); return cloneState(state) }),
    appendEvents: vi.fn(async (events: PalimpsestEvent[]) => {
      calls.push('appendEvents')
      appended.push(events)
      for (const event of events) applyEvent(state, event)
    }),
  }
}

function resultText(result: CallToolResult): string {
  return (result.content[0] as { type: 'text'; text: string }).text
}

function parseOk<T>(result: CallToolResult): { ok: boolean } & T {
  return JSON.parse(resultText(result)) as { ok: boolean } & T
}

// A fake store whose second sync() call (the post-append confirmation flush) silently "fails" by
// flipping syncState.health to 'error' rather than throwing — mirroring how TodoistStore.sync()
// swallows network errors internally instead of rejecting. appendEvents still folds the event
// into state, since the local write itself succeeded; only the confirmation flush is unreliable.
function flakyFlushStore(initial: ProjectionState): TaskStore & { calls: string[] } {
  const state = initial
  const calls: string[] = []
  let syncCount = 0
  let health: 'idle' | 'error' = 'idle'
  return {
    calls,
    get syncState() {
      return {
        health,
        unsyncedCount: 0,
        pendingConflicts: [],
        lastError: health === 'error' ? 'Todoist Sync API → 500' : undefined,
      }
    },
    sync: vi.fn(async () => {
      calls.push('sync')
      syncCount++
      if (syncCount === 2) health = 'error'
    }),
    getState: vi.fn(async () => { calls.push('getState'); return cloneState(state) }),
    appendEvents: vi.fn(async (events: PalimpsestEvent[]) => {
      calls.push('appendEvents')
      for (const event of events) applyEvent(state, event)
    }),
  }
}

describe('handleTasks', () => {
  test('returns a JSON envelope of matching tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const result = await handleTasks(store, { sphere: 'Work' })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ tasks: { title: string }[] }>(result)
    expect(parsed.ok).toBe(true)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Ship it'])
  })

  test('syncs the store before reading state', async () => {
    const store = fakeStore(buildState({}))
    await handleTasks(store, {})
    expect(store.calls).toEqual(['sync', 'getState'])
  })

  test('attaches a todoistUrl to each task', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const result = await handleTasks(store, { sphere: 'Work' })

    const parsed = parseOk<{ tasks: { id: string; todoistUrl: string }[] }>(result)
    expect(parsed.tasks[0]?.todoistUrl).toBe(`https://todoist.com/app/task/${task.id}`)
  })

  test('surfaces a domain error (unresolved sphere name) as isError', async () => {
    const store = fakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))

    const result = await handleTasks(store, { sphere: 'Nope' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/No sphere matching "Nope"/)
  })

  test('surfaces a store sync failure as isError', async () => {
    const store: TaskStore = {
      sync: vi.fn(async () => { throw new Error('Todoist Sync API → 500') }),
      getState: vi.fn(async () => { throw new Error('should not be called') }),
      appendEvents: vi.fn(async () => { throw new Error('should not be called') }),
    }

    const result = await handleTasks(store, {})

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Todoist Sync API/)
  })

  test('maps all filter flags through to the query', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, title: 'Actionable one', isNext: true })
    const other = makeTask({ projectId: project.id, title: 'Not actionable' })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task, other] }))

    const result = await handleTasks(store, { project: 'Launch', actionable: true, limit: 5 })

    const parsed = parseOk<{ tasks: { title: string }[] }>(result)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Actionable one'])
  })

  test('the processing-style inbox query: actionable + withoutDueDate + withoutAgenda + withoutContext', async () => {
    const sphere = makeSphere()
    const bare = makeTask({ sphereId: sphere.id, title: 'Bare', isNext: true })
    const dated = makeTask({ sphereId: sphere.id, title: 'Dated', isNext: true, dueDate: '2026-08-10' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [bare, dated] }))

    const result = await handleTasks(store, {
      actionable: true, withoutDueDate: true, withoutAgenda: true, withoutContext: true,
    })

    const parsed = parseOk<{ tasks: { title: string }[] }>(result)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Bare'])
  })

  test('hasContext for the pick-list-style query', async () => {
    const sphere = makeSphere()
    const context = makeContext(sphere)
    const withContext = makeTask({ sphereId: sphere.id, title: 'HasContext', contextId: context.id })
    const withoutContext = makeTask({ sphereId: sphere.id, title: 'NoContext' })
    const store = fakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [withContext, withoutContext] }))

    const result = await handleTasks(store, { hasContext: true })

    const parsed = parseOk<{ tasks: { title: string }[] }>(result)
    expect(parsed.tasks.map(t => t.title)).toEqual(['HasContext'])
  })
})

describe('handleTask', () => {
  test('returns a single task by id', async () => {
    const task = makeTask({ title: 'Find me' })
    const store = fakeStore(buildState({ tasks: [task] }))

    const result = await handleTask(store, { id: task.id })

    const parsed = parseOk<{ task: { title: string } }>(result)
    expect(parsed.task.title).toBe('Find me')
  })

  test('surfaces an unknown id as isError', async () => {
    const store = fakeStore(buildState({}))

    const result = await handleTask(store, { id: 'missing-id' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/No task with id "missing-id"/)
  })
})

describe('handleProjects', () => {
  test('returns projects with computed stats', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const result = await handleProjects(store, { sphere: 'Work' })

    const parsed = parseOk<{ projects: { name: string; hasNextAction: boolean }[] }>(result)
    expect(parsed.projects).toEqual([expect.objectContaining({ name: 'Launch', hasNextAction: true })])
  })

  test('attaches a todoistUrl to each project', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project] }))

    const result = await handleProjects(store, { sphere: 'Work' })

    const parsed = parseOk<{ projects: { id: string; todoistUrl: string }[] }>(result)
    expect(parsed.projects[0]?.todoistUrl).toBe(`https://todoist.com/app/project/${project.id}`)
  })
})

describe('handleSpheres', () => {
  test('returns all spheres, sorted by name', async () => {
    const store = fakeStore(buildState({ spheres: [makeSphere({ name: 'Zeta' }), makeSphere({ name: 'Alpha' })] }))

    const result = await handleSpheres(store, {})

    const parsed = parseOk<{ spheres: { name: string }[] }>(result)
    expect(parsed.spheres.map(s => s.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('handleAgendas', () => {
  test('returns agendas scoped to a sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const other = makeSphere({ name: 'Home' })
    const store = fakeStore(buildState({
      spheres: [sphere, other],
      agendas: [makeAgenda(sphere, { title: 'Standup' }), makeAgenda(other, { title: 'Chores' })],
    }))

    const result = await handleAgendas(store, { sphere: 'Work' })

    const parsed = parseOk<{ agendas: { name: string }[] }>(result)
    expect(parsed.agendas.map(a => a.name)).toEqual(['Standup'])
  })
})

describe('handleContexts', () => {
  test('returns contexts scoped to a sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const other = makeSphere({ name: 'Home' })
    const store = fakeStore(buildState({
      spheres: [sphere, other],
      contexts: [makeContext(sphere, { name: '@errand' }), makeContext(other, { name: '@home' })],
    }))

    const result = await handleContexts(store, { sphere: 'Work' })

    const parsed = parseOk<{ contexts: { name: string }[] }>(result)
    expect(parsed.contexts.map(c => c.name)).toEqual(['@errand'])
  })
})

describe('handleDashboard', () => {
  test('returns due-today/overdue/starred tasks for the given sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2020-01-01' })
    const notDue = makeTask({ sphereId: sphere.id, title: 'NotDue', dueDate: '2099-01-01' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [overdue, notDue] }))

    const result = await handleDashboard(store, { sphere: 'Work' })

    const parsed = parseOk<{ tasks: { title: string }[] }>(result)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Overdue'])
  })

  test('surfaces an unresolved sphere name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handleDashboard(store, { sphere: 'Nope' })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/No sphere matching "Nope"/)
  })
})

describe('handleProcessing', () => {
  test('aggregates across all spheres with no sphere argument', async () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const a = makeTask({ sphereId: sphereA.id, title: 'A', isNext: true })
    const b = makeTask({ sphereId: sphereB.id, title: 'B', isNext: true })
    const store = fakeStore(buildState({ spheres: [sphereA, sphereB], tasks: [a, b] }))

    const result = await handleProcessing(store, {})

    const parsed = parseOk<{ actionableTasks: { title: string }[] }>(result)
    expect(parsed.actionableTasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('handleWaiting', () => {
  test('groups waiting tasks by kind', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'Review', waitingFor: { kind: 'review' } })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [reviewTask] }))

    const result = await handleWaiting(store, { sphere: 'Work' })

    const parsed = parseOk<{ groups: { kind: string; tasks: { title: string }[] }[] }>(result)
    expect(parsed.groups).toEqual([{ kind: 'review', tasks: [expect.objectContaining({ title: 'Review' })] }])
  })
})

describe('handleCompleteTask', () => {
  test('completes a non-recurring task: appends task.completed, flushes, and returns the updated task', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it', status: 'open' })
    const store = mutableFakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const result = await handleCompleteTask(store, { id: task.id })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.completed', taskId: task.id })]])
    const parsed = parseOk<{ synced: boolean; task: { title: string; status: string } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.task).toEqual(expect.objectContaining({ title: 'Ship it', status: 'completed' }))
  })

  test('attaches a todoistUrl to the returned task', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it', status: 'open' })
    const store = mutableFakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const result = await handleCompleteTask(store, { id: task.id })

    const parsed = parseOk<{ task: { id: string; todoistUrl: string } }>(result)
    expect(parsed.task.todoistUrl).toBe(`https://todoist.com/app/task/${task.id}`)
  })

  test('reports synced:false with a warning when the confirmation flush silently fails, without treating the call as an error', async () => {
    const task = makeTask({ title: 'Ship it', status: 'open' })
    const store = flakyFlushStore(buildState({ tasks: [task] }))

    const result = await handleCompleteTask(store, { id: task.id })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ synced: boolean; warning?: string; task: { status: string } }>(result)
    expect(parsed.ok).toBe(true)
    expect(parsed.synced).toBe(false)
    expect(parsed.warning).toMatch(/not yet confirmed/)
    // The event was still applied locally — the task is completed even though confirmation failed.
    expect(parsed.task.status).toBe('completed')
  })

  test('recurs a recurring task instead of closing it', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({
      sphereId: sphere.id, title: 'Water plants', status: 'open',
      dueDate: '2026-06-25', dueDateExpression: 'every day',
    })
    const store = mutableFakeStore(buildState({ spheres: [sphere], tasks: [task] }))
    const expectedNewDueDate = nextDueDate('every day', new Date().toISOString().slice(0, 10))

    const result = await handleCompleteTask(store, { id: task.id })

    expect(result.isError).toBeUndefined()
    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.recurred', taskId: task.id })]])
    const parsed = parseOk<{ task: { status: string; dueDate: string } }>(result)
    expect(parsed.task).toEqual(expect.objectContaining({ status: 'open', dueDate: expectedNewDueDate }))
  })

  test('surfaces an unknown id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleCompleteTask(store, { id: 'missing-id' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Task not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an already-completed task as isError, and never appends', async () => {
    const task = makeTask({ status: 'completed' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleCompleteTask(store, { id: task.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/already completed/)
    expect(store.appended).toEqual([])
  })

  test('surfaces a sync/appendEvents rejection as isError rather than throwing', async () => {
    const task = makeTask({ status: 'open' })
    const store: TaskStore = {
      sync: vi.fn(async () => { /* first sync ok */ }),
      getState: vi.fn(async () => buildState({ tasks: [task] })),
      appendEvents: vi.fn(async () => { throw new Error('Todoist Sync API → 500') }),
    }

    const result = await handleCompleteTask(store, { id: task.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Todoist Sync API/)
  })
})

describe('handleSetDueDate', () => {
  test('sets a due date on an open task, flushes, and returns the updated task', async () => {
    const task = makeTask({ title: 'Ship it', status: 'open' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleSetDueDate(store, { id: task.id, dueDate: '2026-08-15' })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { dueDate: '2026-08-15' },
    })]])
    const parsed = parseOk<{ synced: boolean; task: { dueDate: string } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.task.dueDate).toBe('2026-08-15')
  })

  test('resolves "today" to today\'s date', async () => {
    const task = makeTask({ status: 'open' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))
    const today = new Date()
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const result = await handleSetDueDate(store, { id: task.id, dueDate: 'today' })

    const parsed = parseOk<{ task: { dueDate: string } }>(result)
    expect(parsed.task.dueDate).toBe(expected)
  })

  test('clears a due date when dueDate is null', async () => {
    const task = makeTask({ status: 'open', dueDate: '2026-01-01' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleSetDueDate(store, { id: task.id, dueDate: null })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { dueDate: null },
    })]])
    const parsed = parseOk<{ task: { dueDate: string | null } }>(result)
    expect(parsed.task.dueDate).toBeNull()
  })

  test('reports synced:false with a warning when the confirmation flush silently fails', async () => {
    const task = makeTask({ title: 'Ship it', status: 'open' })
    const store = flakyFlushStore(buildState({ tasks: [task] }))

    const result = await handleSetDueDate(store, { id: task.id, dueDate: '2026-08-15' })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ synced: boolean; warning?: string; task: { dueDate: string } }>(result)
    expect(parsed.synced).toBe(false)
    expect(parsed.warning).toMatch(/not yet confirmed/)
    expect(parsed.task.dueDate).toBe('2026-08-15')
  })

  test('surfaces an unknown id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleSetDueDate(store, { id: 'missing-id', dueDate: '2026-08-15' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Task not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('surfaces a completed task as isError, and never appends', async () => {
    const task = makeTask({ status: 'completed' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleSetDueDate(store, { id: task.id, dueDate: '2026-08-15' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Cannot update a completed task/)
    expect(store.appended).toEqual([])
  })
})

describe('handleDeleteTask', () => {
  test('deletes an open task, flushes, and returns the updated task', async () => {
    const task = makeTask({ title: 'Ship it', status: 'open' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleDeleteTask(store, { id: task.id })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.deleted', taskId: task.id })]])
    const parsed = parseOk<{ synced: boolean; task: { status: string } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.task.status).toBe('deleted')
  })

  test('reports synced:false with a warning when the confirmation flush silently fails', async () => {
    const task = makeTask({ title: 'Ship it', status: 'open' })
    const store = flakyFlushStore(buildState({ tasks: [task] }))

    const result = await handleDeleteTask(store, { id: task.id })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ synced: boolean; warning?: string; task: { status: string } }>(result)
    expect(parsed.synced).toBe(false)
    expect(parsed.warning).toMatch(/not yet confirmed/)
    expect(parsed.task.status).toBe('deleted')
  })

  test('surfaces an unknown id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleDeleteTask(store, { id: 'missing-id' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Task not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an already-deleted task as isError, and never appends', async () => {
    const task = makeTask({ status: 'deleted' })
    const store = mutableFakeStore(buildState({ tasks: [task] }))

    const result = await handleDeleteTask(store, { id: task.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/already deleted/)
    expect(store.appended).toEqual([])
  })

  test('surfaces a sync/appendEvents rejection as isError rather than throwing', async () => {
    const task = makeTask({ status: 'open' })
    const store: TaskStore = {
      sync: vi.fn(async () => { /* first sync ok */ }),
      getState: vi.fn(async () => buildState({ tasks: [task] })),
      appendEvents: vi.fn(async () => { throw new Error('Todoist Sync API → 500') }),
    }

    const result = await handleDeleteTask(store, { id: task.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Todoist Sync API/)
  })
})

describe('handlePickList', () => {
  test('groups actionable, context-having tasks by context', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: '@errand' })
    const task = makeTask({ sphereId: sphere.id, title: 'DoTheThing', isNext: true, contextId: context.id })
    const store = fakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [task] }))

    const result = await handlePickList(store, { sphere: 'Work' })

    const parsed = parseOk<{ groups: { context: { name: string }; tasks: { title: string }[] }[] }>(result)
    expect(parsed.groups).toEqual([{ context: { id: context.id, name: '@errand' }, tasks: [expect.objectContaining({ title: 'DoTheThing' })] }])
  })

  test('surfaces an unresolved sphere name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handlePickList(store, { sphere: 'Nope' })
    expect(result.isError).toBe(true)
  })
})

describe('handleSearch', () => {
  test('returns matching tasks and projects without loading the whole list', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk' })
    const other = makeTask({ sphereId: sphere.id, title: 'Call dentist' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [task, other] }))

    const result = await handleSearch(store, { query: 'milk' })

    const parsed = parseOk<{ results: { kind: string; task?: { title: string } }[] }>(result)
    expect(parsed.results.map(r => r.task?.title)).toEqual(['Buy milk'])
  })

  test('matches a partial word (find-as-you-type)', async () => {
    const task = makeTask({ title: 'Buy groceries' })
    const store = fakeStore(buildState({ tasks: [task] }))

    const result = await handleSearch(store, { query: 'groc' })

    const parsed = parseOk<{ results: { task?: { title: string } }[] }>(result)
    expect(parsed.results.map(r => r.task?.title)).toEqual(['Buy groceries'])
  })

  test('attaches a todoistUrl to matched tasks', async () => {
    const task = makeTask({ title: 'Buy milk' })
    const store = fakeStore(buildState({ tasks: [task] }))

    const result = await handleSearch(store, { query: 'milk' })

    const parsed = parseOk<{ results: { task?: { id: string; todoistUrl: string } }[] }>(result)
    expect(parsed.results[0]?.task?.todoistUrl).toBe(`https://todoist.com/app/task/${task.id}`)
  })

  test('surfaces an unresolved sphere name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handleSearch(store, { query: 'milk', sphere: 'Nope' })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/No sphere matching "Nope"/)
  })
})
