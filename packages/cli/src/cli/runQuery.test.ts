import { describe, test, expect } from 'vitest'
import type { TaskId } from 'palimpsest'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './fixtures.js'
import { runQuery } from './runQuery.js'

describe('tasks: default filtering and ordering', () => {
  test('defaults to open status only', () => {
    const sphere = makeSphere()
    const open = makeTask({ sphereId: sphere.id, title: 'Open' })
    const completed = makeTask({ sphereId: sphere.id, title: 'Done', status: 'completed', completedAt: '2026-07-01T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [open, completed] })

    const result = runQuery(state, { kind: 'tasks' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Open'])
  })

  test('status completed sorts by completedAt descending', () => {
    const sphere = makeSphere()
    const older = makeTask({ sphereId: sphere.id, title: 'Older', status: 'completed', completedAt: '2026-07-01T00:00:00.000Z' })
    const newer = makeTask({ sphereId: sphere.id, title: 'Newer', status: 'completed', completedAt: '2026-07-15T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [older, newer] })

    const result = runQuery(state, { kind: 'tasks', status: 'completed' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Newer', 'Older'])
  })

  test('default ordering is dueDate ascending, undated last, tie-broken by createdAt', () => {
    const sphere = makeSphere()
    const undated = makeTask({ sphereId: sphere.id, title: 'Undated', createdAt: '2026-01-01T00:00:00.000Z' })
    const dueLater = makeTask({ sphereId: sphere.id, title: 'Later', dueDate: '2026-08-10', createdAt: '2026-01-02T00:00:00.000Z' })
    const dueSooner = makeTask({ sphereId: sphere.id, title: 'Sooner', dueDate: '2026-08-01', createdAt: '2026-01-03T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [undated, dueLater, dueSooner] })

    const result = runQuery(state, { kind: 'tasks' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Sooner', 'Later', 'Undated'])
  })

  test('status any includes deleted tasks', () => {
    const sphere = makeSphere()
    const deleted = makeTask({ sphereId: sphere.id, title: 'Gone', status: 'deleted' })
    const state = buildState({ spheres: [sphere], tasks: [deleted] })

    const openResult = runQuery(state, { kind: 'tasks' }) as { tasks: unknown[] }
    expect(openResult.tasks).toEqual([])

    const anyResult = runQuery(state, { kind: 'tasks', status: 'any' }) as { tasks: { title: string }[] }
    expect(anyResult.tasks.map(t => t.title)).toEqual(['Gone'])
  })

  test('empty result set is a normal success, not an error', () => {
    const state = buildState({})
    const result = runQuery(state, { kind: 'tasks' }) as { count: number; total: number; tasks: unknown[] }
    expect(result).toEqual({ count: 0, total: 0, truncated: false, tasks: [] })
  })
})

describe('tasks: filters', () => {
  test('sphere + context filters combine', () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const context = makeContext(sphere, { name: 'Email' })
    const match = makeTask({ sphereId: sphere.id, contextId: context.id, title: 'Match' })
    const wrongContext = makeTask({ sphereId: sphere.id, title: 'WrongContext' })
    const wrongSphere = makeTask({ sphereId: otherSphere.id, contextId: context.id, title: 'WrongSphere' })
    const state = buildState({ spheres: [sphere, otherSphere], contexts: [context], tasks: [match, wrongContext, wrongSphere] })

    const result = runQuery(state, { kind: 'tasks', sphere: 'Work', context: 'Email' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Match'])
  })

  test('archived project tasks excluded by default, included with includeArchived', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { isArchived: true })
    const task = makeTask({ projectId: project.id, title: 'InArchivedProject' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })

    const excluded = runQuery(state, { kind: 'tasks' }) as { tasks: unknown[] }
    expect(excluded.tasks).toEqual([])

    const included = runQuery(state, { kind: 'tasks', includeArchived: true }) as { tasks: { title: string }[] }
    expect(included.tasks.map(t => t.title)).toEqual(['InArchivedProject'])
  })

  test('dueBefore with injected today returns only overdue tasks', () => {
    const sphere = makeSphere()
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2026-07-30' })
    const dueToday = makeTask({ sphereId: sphere.id, title: 'Today', dueDate: '2026-08-01' })
    const state = buildState({ spheres: [sphere], tasks: [overdue, dueToday] })

    const result = runQuery(state, { kind: 'tasks', dueBefore: 'today' }, { today: '2026-08-01' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Overdue'])
  })

  test('dueOn with injected today matches exactly', () => {
    const sphere = makeSphere()
    const dueToday = makeTask({ sphereId: sphere.id, title: 'Today', dueDate: '2026-08-01' })
    const dueTomorrow = makeTask({ sphereId: sphere.id, title: 'Tomorrow', dueDate: '2026-08-02' })
    const state = buildState({ spheres: [sphere], tasks: [dueToday, dueTomorrow] })

    const result = runQuery(state, { kind: 'tasks', dueOn: 'today' }, { today: '2026-08-01' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Today'])
  })

  test('limit truncates and reports total/truncated', () => {
    const sphere = makeSphere()
    const tasks = [1, 2, 3].map(n => makeTask({ sphereId: sphere.id, title: `Task ${n}`, dueDate: `2026-08-0${n}` }))
    const state = buildState({ spheres: [sphere], tasks })

    const result = runQuery(state, { kind: 'tasks', limit: 2 }) as { count: number; total: number; truncated: boolean; tasks: unknown[] }
    expect(result).toMatchObject({ count: 2, total: 3, truncated: true })
  })

  test('limit that does not bite reports truncated false', () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id })
    const state = buildState({ spheres: [sphere], tasks: [task] })

    const result = runQuery(state, { kind: 'tasks', limit: 5 }) as { total: number; truncated: boolean }
    expect(result).toMatchObject({ total: 1, truncated: false })
  })
})

describe('tasks: errors', () => {
  test('unresolved sphere name throws a readable error', () => {
    const state = buildState({ spheres: [makeSphere({ name: 'Work' })] })
    expect(() => runQuery(state, { kind: 'tasks', sphere: 'Nope' })).toThrowError(/No sphere matching "Nope"/)
  })

  test('ambiguous project name across spheres throws', () => {
    const workSphere = makeSphere({ name: 'Work' })
    const personalSphere = makeSphere({ name: 'Personal' })
    const workWebsite = makeProject(workSphere, { name: 'Website' })
    const personalWebsite = makeProject(personalSphere, { name: 'Website' })
    const state = buildState({ spheres: [workSphere, personalSphere], projects: [workWebsite, personalWebsite] })
    expect(() => runQuery(state, { kind: 'tasks', project: 'Website' })).toThrowError(/Ambiguous project "Website"/)
  })
})

describe('task <id>', () => {
  test('returns the task by id', () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, title: 'Find me' })
    const state = buildState({ spheres: [sphere], tasks: [task] })
    const result = runQuery(state, { kind: 'task', id: task.id }) as { task: { title: string } }
    expect(result.task.title).toBe('Find me')
  })

  test('unknown id throws not-found', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'task', id: 'missing' as TaskId })).toThrowError(/No task with id "missing"/)
  })
})

describe('projects', () => {
  test('includes openTaskCount and hasNextAction, excludes archived by default', () => {
    const sphere = makeSphere({ name: 'Work' })
    const active = makeProject(sphere, { name: 'Active' })
    const archived = makeProject(sphere, { name: 'Archived', isArchived: true })
    const task = makeTask({ projectId: active.id, isNext: true })
    const state = buildState({ spheres: [sphere], projects: [active, archived], tasks: [task] })

    const result = runQuery(state, { kind: 'projects' }) as { projects: { name: string; openTaskCount: number; hasNextAction: boolean }[] }
    expect(result.projects).toEqual([{ name: 'Active', openTaskCount: 1, hasNextAction: true }].map(p => expect.objectContaining(p)))
  })

  test('archived flag shows only archived, all shows both, sorted by name', () => {
    const sphere = makeSphere()
    const beta = makeProject(sphere, { name: 'Beta' })
    const alpha = makeProject(sphere, { name: 'Alpha', isArchived: true })
    const state = buildState({ spheres: [sphere], projects: [beta, alpha] })

    const archivedOnly = runQuery(state, { kind: 'projects', archived: true }) as { projects: { name: string }[] }
    expect(archivedOnly.projects.map(p => p.name)).toEqual(['Alpha'])

    const all = runQuery(state, { kind: 'projects', all: true }) as { projects: { name: string }[] }
    expect(all.projects.map(p => p.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('spheres, agendas, contexts', () => {
  test('spheres sorted by name', () => {
    const state = buildState({ spheres: [makeSphere({ name: 'Work' }), makeSphere({ name: 'Personal' })] })
    const result = runQuery(state, { kind: 'spheres' }) as { spheres: { name: string }[] }
    expect(result.spheres.map(s => s.name)).toEqual(['Personal', 'Work'])
  })

  test('agendas scoped by sphere', () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workAgenda = makeAgenda(work, { title: 'Standup' })
    const personalAgenda = makeAgenda(personal, { title: 'Family' })
    const state = buildState({ spheres: [work, personal], agendas: [workAgenda, personalAgenda] })

    const result = runQuery(state, { kind: 'agendas', sphere: 'Work' }) as { agendas: { name: string }[] }
    expect(result.agendas.map(a => a.name)).toEqual(['Standup'])
  })

  test('contexts sorted by name', () => {
    const sphere = makeSphere()
    const state = buildState({ spheres: [sphere], contexts: [makeContext(sphere, { name: 'Phone' }), makeContext(sphere, { name: 'Email' })] })
    const result = runQuery(state, { kind: 'contexts' }) as { contexts: { name: string }[] }
    expect(result.contexts.map(c => c.name)).toEqual(['Email', 'Phone'])
  })
})
