import { describe, test, expect, vi } from 'vitest'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { applyEvent, cloneState, nextDueDate, validateBatch } from '@alnorth/palimpsest'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './testFixtures'
import type { TaskStore } from './tools'
import {
  handleTasks, handleTask, handleProjects, handleSpheres, handleAgendas, handleContexts,
  handleDashboard, handleProcessing, handleWaiting, handlePickList, handleSearch, handleAgendaView,
  handleCompleteTask, handleSetDueDate, handleDeleteTask, handleSetProjectAgenda,
  handleSetTaskSphere, handleSetProjectSphere,
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
      // Mirrors core's real PalimpsestStore.appendEvents, which validates against the current
      // state before applying — otherwise this fake would silently accept events (e.g. a
      // cross-sphere agenda link) that production would reject.
      validateBatch(state, events)
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

  test('agenda/hasAgenda/withoutAgenda filters pass through to the query', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const store = fakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [linked, unlinked] }))

    const byAgenda = await handleProjects(store, { agenda: 'Jim' })
    expect(parseOk<{ projects: { name: string }[] }>(byAgenda).projects.map(p => p.name)).toEqual(['Shared'])

    const withAgenda = await handleProjects(store, { hasAgenda: true })
    expect(parseOk<{ projects: { name: string }[] }>(withAgenda).projects.map(p => p.name)).toEqual(['Shared'])

    const withoutAgenda = await handleProjects(store, { withoutAgenda: true })
    expect(parseOk<{ projects: { name: string }[] }>(withoutAgenda).projects.map(p => p.name)).toEqual(['Solo'])
  })

  test('isSelfOnly filter passes through to the query', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const selfOnly = makeProject(sphere, { name: 'Personal', isSelfOnly: true })
    const other = makeProject(sphere, { name: 'Other' })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [selfOnly, other] }))

    const filtered = await handleProjects(store, { isSelfOnly: true })
    expect(parseOk<{ projects: { name: string }[] }>(filtered).projects.map(p => p.name)).toEqual(['Personal'])
  })

  test('omits nextTasks by default', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const result = await handleProjects(store, { sphere: 'Work' })

    const parsed = parseOk<{ projects: Record<string, unknown>[] }>(result)
    expect(parsed.projects[0]).not.toHaveProperty('nextTasks')
  })

  test('includeNextTasks includes each project\'s open next-action tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true, title: 'Ship it' })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const result = await handleProjects(store, { sphere: 'Work', includeNextTasks: true })

    const parsed = parseOk<{ projects: { name: string; nextTasks: { title: string }[] }[] }>(result)
    expect(parsed.projects[0]?.nextTasks.map(t => t.title)).toEqual(['Ship it'])
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

describe('handleSetProjectAgenda', () => {
  test('links a project to an agenda, flushes, and returns the updated project', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = mutableFakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: agenda.id })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: agenda.id },
    })]])
    const parsed = parseOk<{ synced: boolean; project: { name: string; agenda: { name: string } | null } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.project.name).toBe('Launch')
    expect(parsed.project.agenda).toEqual({ id: agenda.id, name: 'Jim' })
  })

  test('attaches a todoistUrl to the returned project', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere)
    const store = mutableFakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: agenda.id })

    const parsed = parseOk<{ project: { id: string; todoistUrl: string } }>(result)
    expect(parsed.project.todoistUrl).toBe(`https://todoist.com/app/project/${project.id}`)
  })

  test('clears an agenda link when agendaId is null', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere, { agendaId: agenda.id })
    const store = mutableFakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: null })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: null },
    })]])
    const parsed = parseOk<{ project: { agenda: { name: string } | null } }>(result)
    expect(parsed.project.agenda).toBeNull()
  })

  test('reports synced:false with a warning when the confirmation flush silently fails', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere)
    const store = flakyFlushStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: agenda.id })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ synced: boolean; warning?: string; project: { agenda: { name: string } | null } }>(result)
    expect(parsed.synced).toBe(false)
    expect(parsed.warning).toMatch(/not yet confirmed/)
    expect(parsed.project.agenda).not.toBeNull()
  })

  test('surfaces an unknown project id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleSetProjectAgenda(store, { id: 'missing-id', agendaId: 'agenda-jim' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Project not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('selfOnly: true marks a project self-only with no agendaId argument', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = mutableFakeStore(buildState({ spheres: [sphere], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, selfOnly: true })

    expect(result.isError).toBeUndefined()
    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { isSelfOnly: true },
    })]])
    const parsed = parseOk<{ project: { isSelfOnly: boolean } }>(result)
    expect(parsed.project.isSelfOnly).toBe(true)
  })

  test('rejects a call with both agendaId and selfOnly:true, without appending', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere)
    const store = mutableFakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: agenda.id, selfOnly: true })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/agendaId.*selfOnly/i)
    expect(store.appended).toEqual([])
  })

  test('a same-sphere validation violation surfaces as isError', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const agenda = makeAgenda(otherSphere)
    const project = makeProject(sphere)
    const store = mutableFakeStore(buildState({ spheres: [sphere, otherSphere], agendas: [agenda], projects: [project] }))

    const result = await handleSetProjectAgenda(store, { id: project.id, agendaId: agenda.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/different sphere/)
    expect(store.appended).toEqual([])
  })
})

describe('handleSetTaskSphere', () => {
  test('sets a new sphereId on a project-less task, flushes, and returns the updated task', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk', status: 'open' })
    const store = mutableFakeStore(buildState({ spheres: [sphere, otherSphere], tasks: [task] }))

    const result = await handleSetTaskSphere(store, { id: task.id, sphereId: otherSphere.id })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { sphereId: otherSphere.id },
    })]])
    const parsed = parseOk<{ synced: boolean; task: { title: string; sphere: { name: string } } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.task.title).toBe('Buy milk')
    expect(parsed.task.sphere).toEqual({ id: otherSphere.id, name: 'Personal' })
  })

  test('reports synced:false with a warning when the confirmation flush silently fails', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = flakyFlushStore(buildState({ spheres: [sphere, otherSphere], tasks: [task] }))

    const result = await handleSetTaskSphere(store, { id: task.id, sphereId: otherSphere.id })

    expect(result.isError).toBeUndefined()
    const parsed = parseOk<{ synced: boolean; warning?: string }>(result)
    expect(parsed.synced).toBe(false)
    expect(parsed.warning).toMatch(/not yet confirmed/)
  })

  test('surfaces an unknown task id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleSetTaskSphere(store, { id: 'missing-id', sphereId: 'sph-1' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Task not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('surfaces a task that belongs to a project as isError, and never appends', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const proj = makeProject(sphere)
    const task = makeTask({ projectId: proj.id, status: 'open' })
    const store = mutableFakeStore(buildState({ spheres: [sphere], projects: [proj], tasks: [task] }))

    const result = await handleSetTaskSphere(store, { id: task.id, sphereId: sphere.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/cannot have both a projectId and a direct sphereId/)
    expect(store.appended).toEqual([])
  })
})

describe('handleSetProjectSphere', () => {
  test('moves a project to a different sphere, flushes, and returns the updated project', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const proj = makeProject(sphere, { name: 'Launch' })
    const store = mutableFakeStore(buildState({ spheres: [sphere, otherSphere], projects: [proj] }))

    const result = await handleSetProjectSphere(store, { id: proj.id, sphereId: otherSphere.id })

    expect(result.isError).toBeUndefined()
    expect(store.calls).toEqual(['sync', 'getState', 'appendEvents', 'sync', 'getState'])
    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: proj.id, patch: { sphereId: otherSphere.id },
    })]])
    const parsed = parseOk<{ synced: boolean; project: { name: string; sphere: { name: string } } }>(result)
    expect(parsed.synced).toBe(true)
    expect(parsed.project.name).toBe('Launch')
    expect(parsed.project.sphere).toEqual({ id: otherSphere.id, name: 'Personal' })
  })

  test('surfaces an unknown project id as isError, and never appends', async () => {
    const store = mutableFakeStore(buildState({}))

    const result = await handleSetProjectSphere(store, { id: 'missing-id', sphereId: 'sph-1' })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/Project not found: missing-id/)
    expect(store.appended).toEqual([])
  })

  test('a cross-sphere agenda-link violation surfaces as isError', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const agenda = makeAgenda(sphere)
    const proj = makeProject(sphere, { agendaId: agenda.id })
    const store = mutableFakeStore(buildState({ spheres: [sphere, otherSphere], agendas: [agenda], projects: [proj] }))

    const result = await handleSetProjectSphere(store, { id: proj.id, sphereId: otherSphere.id })

    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/different sphere/)
    expect(store.appended).toEqual([])
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

describe('handleAgendaView', () => {
  test('returns the agenda, waiting/active tasks, and linked projects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const project = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const active = makeTask({ sphereId: sphere.id, title: 'Active', agendaId: agenda.id })
    const waiting = makeTask({ sphereId: sphere.id, title: 'Waiting', agendaId: agenda.id, waitingFor: { kind: 'review' } })
    const store = fakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project], tasks: [active, waiting] }))

    const result = await handleAgendaView(store, { agenda: 'Han' })

    const parsed = parseOk<{
      agenda: { name: string }
      activeTasks: { title: string }[]
      waitingTasks: { title: string }[]
      projects: { name: string }[]
    }>(result)
    expect(parsed.agenda.name).toBe('Han')
    expect(parsed.activeTasks.map(t => t.title)).toEqual(['Active'])
    expect(parsed.waitingTasks.map(t => t.title)).toEqual(['Waiting'])
    expect(parsed.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('surfaces an unresolved agenda name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handleAgendaView(store, { agenda: 'Nope' })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toMatch(/No agenda matching "Nope"/)
  })
})
