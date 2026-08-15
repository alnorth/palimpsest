import { describe, test, expect, vi } from 'vitest'
import MiniSearch from 'minisearch'
import { makeSphere, makeProject, makeTask, buildState } from './fixtures'
import { searchAll } from './search'

describe('searchAll', () => {
  test('matches a task by a whole word in its title', () => {
    const task = makeTask({ title: 'Buy milk' })
    const other = makeTask({ title: 'Call dentist' })
    const state = buildState({ tasks: [task, other] })

    const results = searchAll(state, 'milk')

    expect(results).toEqual([{ kind: 'task', score: expect.any(Number), task: expect.objectContaining({ title: 'Buy milk' }) }])
  })

  test('matches a partial word at the end (prefix / find-as-you-type)', () => {
    const task = makeTask({ title: 'Buy groceries' })
    const state = buildState({ tasks: [task] })

    const results = searchAll(state, 'groc')

    expect(results.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy groceries'])
  })

  test('is typo-tolerant (fuzzy matching)', () => {
    const task = makeTask({ title: 'Buy groceries' })
    const state = buildState({ tasks: [task] })

    const results = searchAll(state, 'grocceries')

    expect(results.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy groceries'])
  })

  test('matches a task by its description as well as its title', () => {
    const task = makeTask({ title: 'Errand', description: 'pick up the dry cleaning' })
    const state = buildState({ tasks: [task] })

    const results = searchAll(state, 'cleaning')

    expect(results.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Errand'])
  })

  test('ranks a title match above a description-only match for the same term', () => {
    const titleMatch = makeTask({ title: 'Website redesign' })
    const descriptionMatch = makeTask({ title: 'Other task', description: 'talk about the redesign next week' })
    const state = buildState({ tasks: [titleMatch, descriptionMatch] })

    const results = searchAll(state, 'redesign')

    expect(results.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Website redesign', 'Other task'])
  })

  test('matches projects by name and description', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Kitchen renovation' })
    const state = buildState({ spheres: [sphere], projects: [project] })

    const results = searchAll(state, 'renovation')

    expect(results).toEqual([{ kind: 'project', score: expect.any(Number), project: expect.objectContaining({ name: 'Kitchen renovation' }) }])
  })

  test('combines tasks and projects in one ranked list', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Launch plan' })
    const task = makeTask({ title: 'Finalize launch date' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })

    const results = searchAll(state, 'launch')

    expect(results.map(r => r.kind)).toEqual(expect.arrayContaining(['task', 'project']))
    expect(results).toHaveLength(2)
  })

  test('excludes completed and deleted tasks by default', () => {
    const completed = makeTask({ title: 'Old milk task', status: 'completed', completedAt: '2026-01-01T00:00:00.000Z' })
    const deleted = makeTask({ title: 'Deleted milk task', status: 'deleted' })
    const state = buildState({ tasks: [completed, deleted] })

    expect(searchAll(state, 'milk')).toEqual([])
  })

  test('excludes archived projects by default, includes them with includeArchived', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Old archive project', isArchived: true })
    const state = buildState({ spheres: [sphere], projects: [project] })

    expect(searchAll(state, 'archive')).toEqual([])
    expect(searchAll(state, 'archive', { includeArchived: true }).map(r => r.kind)).toEqual(['project'])
  })

  test('excludes tasks belonging to an archived project by default, includes them with includeArchived', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { isArchived: true })
    const task = makeTask({ projectId: project.id, title: 'Buried treasure task' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })

    expect(searchAll(state, 'treasure')).toEqual([])
    expect(searchAll(state, 'treasure', { includeArchived: true }).map(r => r.kind)).toEqual(['task'])
  })

  test('scopes to a sphere when sphereId is given', () => {
    const sphere = makeSphere()
    const otherSphere = makeSphere()
    const inSphere = makeTask({ sphereId: sphere.id, title: 'Sphere milk task' })
    const outOfSphere = makeTask({ sphereId: otherSphere.id, title: 'Other milk task' })
    const state = buildState({ spheres: [sphere, otherSphere], tasks: [inSphere, outOfSphere] })

    const results = searchAll(state, 'milk', { sphereId: sphere.id })

    expect(results.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Sphere milk task'])
  })

  test('returns an empty array for a blank query rather than throwing', () => {
    const state = buildState({ tasks: [makeTask({ title: 'Anything' })] })
    expect(searchAll(state, '')).toEqual([])
    expect(searchAll(state, '   ')).toEqual([])
  })

  test('returns an empty array when there is nothing to search', () => {
    const state = buildState({})
    expect(searchAll(state, 'anything')).toEqual([])
  })
})

describe('searchAll index caching', () => {
  test('reuses the built index across repeated calls against the same, unchanged state', () => {
    const addAllSpy = vi.spyOn(MiniSearch.prototype, 'addAll')
    try {
      const task = makeTask({ title: 'Buy milk' })
      const state = buildState({ tasks: [task] })

      searchAll(state, 'milk')
      searchAll(state, 'mil')
      searchAll(state, 'm')

      expect(addAllSpy).toHaveBeenCalledTimes(1)
    } finally {
      addAllSpy.mockRestore()
    }
  })

  test('builds a separate cached index per distinct sphere/includeArchived scope on the same state', () => {
    const addAllSpy = vi.spyOn(MiniSearch.prototype, 'addAll')
    try {
      const sphere = makeSphere()
      const task = makeTask({ sphereId: sphere.id, title: 'Buy milk' })
      const state = buildState({ spheres: [sphere], tasks: [task] })

      searchAll(state, 'milk')
      searchAll(state, 'milk')
      searchAll(state, 'milk', { sphereId: sphere.id })
      searchAll(state, 'milk', { sphereId: sphere.id })

      expect(addAllSpy).toHaveBeenCalledTimes(2)
    } finally {
      addAllSpy.mockRestore()
    }
  })

  test('rebuilds the index for a different state object (e.g. after a real store update)', () => {
    const addAllSpy = vi.spyOn(MiniSearch.prototype, 'addAll')
    try {
      const state = buildState({ tasks: [makeTask({ title: 'Buy milk' })] })
      const updatedState = buildState({ tasks: [makeTask({ title: 'Buy bread' })] })

      searchAll(state, 'milk')
      searchAll(updatedState, 'bread')

      expect(addAllSpy).toHaveBeenCalledTimes(2)
    } finally {
      addAllSpy.mockRestore()
    }
  })
})
