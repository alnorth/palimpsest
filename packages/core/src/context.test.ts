import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createTask } from './commands.js'
import { getContext, listContexts, listTasksByContext } from './query.js'
import type { SphereId, ContextId } from './ids.js'

const sphereId = 'sph1' as SphereId
const contextId = 'ctx1' as ContextId

const baseState = {
  ...createEmptyState(),
  ...buildStateFromConfig([{
    id: sphereId,
    name: 'Work',
    agendas: [],
    contexts: [{ id: contextId, name: 'Home', description: 'At home' }],
  }]),
}

describe('listContexts', () => {
  it('filters by sphereId', () => {
    expect(listContexts(baseState, { sphereId }).map(c => c.id)).toContain(contextId)
    expect(listContexts(baseState, { sphereId: 'other' as SphereId })).toHaveLength(0)
  })
})

describe('getContext', () => {
  it('returns the context by id', () => {
    const ctx = getContext(baseState, contextId)
    expect(ctx?.name).toBe('Home')
    expect(ctx?.sphereId).toBe(sphereId)
    expect(ctx?.description).toBe('At home')
  })

  it('returns undefined for unknown id', () => {
    expect(getContext(baseState, 'nope' as ContextId)).toBeUndefined()
  })
})

describe('task contextId', () => {
  it('creates a task linked to a context', () => {
    const taskEvts = createTask(baseState, { title: 'Buy groceries', sphereId, contextId })
    const state = project(taskEvts, baseState)
    const tasks = listTasksByContext(state, contextId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Buy groceries')
  })

  it('throws if context does not exist when creating a task', () => {
    expect(() =>
      createTask(baseState, { title: 'T', sphereId, contextId: 'nope' as ContextId })
    ).toThrow('Context not found')
  })
})
