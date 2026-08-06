import { describe, test, expect, vi } from 'vitest'
import type { ProjectionState } from '@alnorth/palimpsest'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './testFixtures.js'
import type { TaskStore } from './tools.js'
import {
  handleTasks, handleTask, handleProjects, handleSpheres, handleAgendas, handleContexts,
  handleDashboard, handleProcessing, handleWaiting, handlePickList,
} from './tools.js'

function fakeStore(state: ProjectionState): TaskStore & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    sync: vi.fn(async () => { calls.push('sync') }),
    getState: vi.fn(async () => { calls.push('getState'); return state }),
  }
}

function parseOk<T>(text: string): { ok: boolean } & T {
  return JSON.parse(text) as { ok: boolean } & T
}

describe('handleTasks', () => {
  test('returns a JSON envelope of matching tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const result = await handleTasks(store, { sphere: 'Work' })

    expect(result.isError).toBeUndefined()
    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ tasks: { title: string }[] }>(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Ship it'])
  })

  test('syncs the store before reading state', async () => {
    const store = fakeStore(buildState({}))
    await handleTasks(store, {})
    expect(store.calls).toEqual(['sync', 'getState'])
  })

  test('surfaces a domain error (unresolved sphere name) as isError', async () => {
    const store = fakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))

    const result = await handleTasks(store, { sphere: 'Nope' })

    expect(result.isError).toBe(true)
    const text = (result.content[0] as { type: 'text'; text: string }).text
    expect(text).toMatch(/No sphere matching "Nope"/)
  })

  test('surfaces a store sync failure as isError', async () => {
    const store: TaskStore = {
      sync: vi.fn(async () => { throw new Error('Todoist Sync API → 500') }),
      getState: vi.fn(async () => { throw new Error('should not be called') }),
    }

    const result = await handleTasks(store, {})

    expect(result.isError).toBe(true)
    const text = (result.content[0] as { type: 'text'; text: string }).text
    expect(text).toMatch(/Todoist Sync API/)
  })

  test('maps all filter flags through to the query', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, title: 'Actionable one', isNext: true })
    const other = makeTask({ projectId: project.id, title: 'Not actionable' })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task, other] }))

    const result = await handleTasks(store, { project: 'Launch', actionable: true, limit: 5 })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ tasks: { title: string }[] }>(text)
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

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ tasks: { title: string }[] }>(text)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Bare'])
  })

  test('hasContext for the pick-list-style query', async () => {
    const sphere = makeSphere()
    const context = makeContext(sphere)
    const withContext = makeTask({ sphereId: sphere.id, title: 'HasContext', contextId: context.id })
    const withoutContext = makeTask({ sphereId: sphere.id, title: 'NoContext' })
    const store = fakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [withContext, withoutContext] }))

    const result = await handleTasks(store, { hasContext: true })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ tasks: { title: string }[] }>(text)
    expect(parsed.tasks.map(t => t.title)).toEqual(['HasContext'])
  })
})

describe('handleTask', () => {
  test('returns a single task by id', async () => {
    const task = makeTask({ title: 'Find me' })
    const store = fakeStore(buildState({ tasks: [task] }))

    const result = await handleTask(store, { id: task.id })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ task: { title: string } }>(text)
    expect(parsed.task.title).toBe('Find me')
  })

  test('surfaces an unknown id as isError', async () => {
    const store = fakeStore(buildState({}))

    const result = await handleTask(store, { id: 'missing-id' })

    expect(result.isError).toBe(true)
    const text = (result.content[0] as { type: 'text'; text: string }).text
    expect(text).toMatch(/No task with id "missing-id"/)
  })
})

describe('handleProjects', () => {
  test('returns projects with computed stats', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true })
    const store = fakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const result = await handleProjects(store, { sphere: 'Work' })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ projects: { name: string; hasNextAction: boolean }[] }>(text)
    expect(parsed.projects).toEqual([expect.objectContaining({ name: 'Launch', hasNextAction: true })])
  })
})

describe('handleSpheres', () => {
  test('returns all spheres, sorted by name', async () => {
    const store = fakeStore(buildState({ spheres: [makeSphere({ name: 'Zeta' }), makeSphere({ name: 'Alpha' })] }))

    const result = await handleSpheres(store, {})

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ spheres: { name: string }[] }>(text)
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

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ agendas: { name: string }[] }>(text)
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

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ contexts: { name: string }[] }>(text)
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

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ tasks: { title: string }[] }>(text)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Overdue'])
  })

  test('surfaces an unresolved sphere name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handleDashboard(store, { sphere: 'Nope' })
    expect(result.isError).toBe(true)
    const text = (result.content[0] as { type: 'text'; text: string }).text
    expect(text).toMatch(/No sphere matching "Nope"/)
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

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ actionableTasks: { title: string }[] }>(text)
    expect(parsed.actionableTasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('handleWaiting', () => {
  test('groups waiting tasks by kind', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'Review', waitingFor: { kind: 'review' } })
    const store = fakeStore(buildState({ spheres: [sphere], tasks: [reviewTask] }))

    const result = await handleWaiting(store, { sphere: 'Work' })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ groups: { kind: string; tasks: { title: string }[] }[] }>(text)
    expect(parsed.groups).toEqual([{ kind: 'review', tasks: [expect.objectContaining({ title: 'Review' })] }])
  })
})

describe('handlePickList', () => {
  test('groups actionable, context-having tasks by context', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: '@errand' })
    const task = makeTask({ sphereId: sphere.id, title: 'DoTheThing', isNext: true, contextId: context.id })
    const store = fakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [task] }))

    const result = await handlePickList(store, { sphere: 'Work' })

    const text = (result.content[0] as { type: 'text'; text: string }).text
    const parsed = parseOk<{ groups: { context: { name: string }; tasks: { title: string }[] }[] }>(text)
    expect(parsed.groups).toEqual([{ context: { id: context.id, name: '@errand' }, tasks: [expect.objectContaining({ title: 'DoTheThing' })] }])
  })

  test('surfaces an unresolved sphere name as isError', async () => {
    const store = fakeStore(buildState({}))
    const result = await handlePickList(store, { sphere: 'Nope' })
    expect(result.isError).toBe(true)
  })
})
