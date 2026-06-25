import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { createSphere, createContext, updateContext, deleteContext, createTask } from './commands.js'
import { getContext, listContexts, listTasksByContext } from './query.js'
import { CLEAR } from './events.js'
import type { SphereId, ContextId } from './ids.js'
import type { PalimpsestEvent } from './events.js'

function setup() {
  const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
  const s1 = project(sphereEvts)
  const sphereId = (sphereEvts[0] as any).sphereId as SphereId

  const ctxEvts = createContext(s1, { sphereId, name: 'Home' })
  const s2 = project([...sphereEvts, ...ctxEvts])
  const contextId = (ctxEvts[0] as any).contextId as ContextId

  return { sphereEvts, ctxEvts, s2, sphereId, contextId }
}

describe('createContext', () => {
  it('throws if sphere does not exist', () => {
    expect(() =>
      createContext(createEmptyState(), { sphereId: 'nope' as SphereId, name: 'X' })
    ).toThrow('Sphere not found')
  })

  it('creates a context with the correct fields', () => {
    const { s2, contextId, sphereId } = setup()
    const ctx = getContext(s2, contextId)
    expect(ctx?.name).toBe('Home')
    expect(ctx?.sphereId).toBe(sphereId)
    expect(ctx?.parentContextId).toBeUndefined()
  })

  it('creates a context with an optional description', () => {
    const { sphereEvts, ctxEvts, s2, sphereId } = setup()
    const allEvts: PalimpsestEvent[] = [...sphereEvts, ...ctxEvts]
    const childEvts = createContext(s2, { sphereId, name: 'Office', description: 'At the office' })
    const s3 = project([...allEvts, ...childEvts])
    const childId = (childEvts[0] as any).contextId as ContextId
    expect(getContext(s3, childId)?.description).toBe('At the office')
  })

  it('creates a child context under a parent', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    const childEvts = createContext(s2, { sphereId, name: 'Desk', parentContextId: contextId })
    const s3 = project([...sphereEvts, ...ctxEvts, ...childEvts])
    const childId = (childEvts[0] as any).contextId as ContextId
    expect(getContext(s3, childId)?.parentContextId).toBe(contextId)
  })

  it('throws if parent context does not exist', () => {
    const { s2, sphereId } = setup()
    expect(() =>
      createContext(s2, { sphereId, name: 'Child', parentContextId: 'nope' as ContextId })
    ).toThrow('Context not found')
  })

  it('throws if parent context is in a different sphere', () => {
    const { sphereEvts, ctxEvts, s2, contextId } = setup()

    const sphere2Evts = createSphere(s2, { name: 'Personal' })
    const s3 = project([...sphereEvts, ...ctxEvts, ...sphere2Evts])
    const sphere2Id = (sphere2Evts[0] as any).sphereId as SphereId

    expect(() =>
      createContext(s3, { sphereId: sphere2Id, name: 'Child', parentContextId: contextId })
    ).toThrow('same sphere')
  })
})

describe('updateContext', () => {
  it('updates the name', () => {
    const { sphereEvts, ctxEvts, s2, contextId } = setup()
    const updateEvts = updateContext(s2, contextId, { name: 'Work' })
    const s3 = project([...sphereEvts, ...ctxEvts, ...updateEvts])
    expect(getContext(s3, contextId)?.name).toBe('Work')
  })

  it('sets and clears description', () => {
    const { sphereEvts, ctxEvts, s2, contextId } = setup()
    const s2b = project([...sphereEvts, ...ctxEvts, ...updateContext(s2, contextId, { description: 'desc' })])
    expect(getContext(s2b, contextId)?.description).toBe('desc')
    const clearEvts = updateContext(s2b, contextId, { description: CLEAR })
    const s3 = project([...sphereEvts, ...ctxEvts, ...clearEvts])
    expect(getContext(s3, contextId)?.description).toBeUndefined()
  })

  it('sets and clears parentContextId', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    const parentEvts = createContext(s2, { sphereId, name: 'Parent' })
    const parentId = (parentEvts[0] as any).contextId as ContextId
    const s3 = project([...sphereEvts, ...ctxEvts, ...parentEvts])

    const setEvts = updateContext(s3, contextId, { parentContextId: parentId })
    const s4 = project([...sphereEvts, ...ctxEvts, ...parentEvts, ...setEvts])
    expect(getContext(s4, contextId)?.parentContextId).toBe(parentId)

    const clearEvts = updateContext(s4, contextId, { parentContextId: CLEAR })
    const s5 = project([...sphereEvts, ...ctxEvts, ...parentEvts, ...setEvts, ...clearEvts])
    expect(getContext(s5, contextId)?.parentContextId).toBeUndefined()
  })

  it('throws if context does not exist', () => {
    expect(() =>
      updateContext(createEmptyState(), 'nope' as ContextId, { name: 'X' })
    ).toThrow('Context not found')
  })

  it('throws if a context is set as its own parent', () => {
    const { s2, contextId } = setup()
    expect(() =>
      updateContext(s2, contextId, { parentContextId: contextId })
    ).toThrow('cannot be its own parent')
  })

  it('throws if new parent is in a different sphere', () => {
    const { sphereEvts, ctxEvts, s2, contextId } = setup()
    const sphere2Evts = createSphere(s2, { name: 'Personal' })
    const sphere2Id = (sphere2Evts[0] as any).sphereId as SphereId
    const s3 = project([...sphereEvts, ...ctxEvts, ...sphere2Evts])
    const otherEvts = createContext(s3, { sphereId: sphere2Id, name: 'Other' })
    const otherId = (otherEvts[0] as any).contextId as ContextId
    const s4 = project([...sphereEvts, ...ctxEvts, ...sphere2Evts, ...otherEvts])
    expect(() =>
      updateContext(s4, contextId, { parentContextId: otherId })
    ).toThrow('same sphere')
  })
})

describe('deleteContext', () => {
  it('removes the context', () => {
    const { sphereEvts, ctxEvts, s2, contextId } = setup()
    const delEvts = deleteContext(s2, contextId)
    const s3 = project([...sphereEvts, ...ctxEvts, ...delEvts])
    expect(getContext(s3, contextId)).toBeUndefined()
  })

  it('throws if context does not exist', () => {
    expect(() =>
      deleteContext(createEmptyState(), 'nope' as ContextId)
    ).toThrow('Context not found')
  })
})

describe('listContexts', () => {
  it('filters by sphereId', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    expect(listContexts(s2, { sphereId }).map(c => c.id)).toContain(contextId)
    expect(listContexts(s2, { sphereId: 'other' as SphereId })).toHaveLength(0)
  })

  it('filters root contexts (null parentContextId)', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    const childEvts = createContext(s2, { sphereId, name: 'Child', parentContextId: contextId })
    const s3 = project([...sphereEvts, ...ctxEvts, ...childEvts])
    const roots = listContexts(s3, { parentContextId: null })
    expect(roots.map(c => c.id)).toContain(contextId)
    expect(roots.map(c => c.id)).not.toContain((childEvts[0] as any).contextId)
  })

  it('filters by parentContextId', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    const childEvts = createContext(s2, { sphereId, name: 'Child', parentContextId: contextId })
    const childId = (childEvts[0] as any).contextId as ContextId
    const s3 = project([...sphereEvts, ...ctxEvts, ...childEvts])
    const children = listContexts(s3, { parentContextId: contextId })
    expect(children.map(c => c.id)).toEqual([childId])
  })
})

describe('task contextId', () => {
  it('creates a task linked to a context', () => {
    const { sphereEvts, ctxEvts, s2, sphereId, contextId } = setup()
    const taskEvts = createTask(s2, { title: 'Buy groceries', sphereId, contextId })
    const s3 = project([...sphereEvts, ...ctxEvts, ...taskEvts])
    const tasks = listTasksByContext(s3, contextId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Buy groceries')
  })

  it('throws if context does not exist when creating a task', () => {
    const { s2, sphereId } = setup()
    expect(() =>
      createTask(s2, { title: 'T', sphereId, contextId: 'nope' as ContextId })
    ).toThrow('Context not found')
  })
})
