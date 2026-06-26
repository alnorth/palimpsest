import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilePalimpsestStore } from './store.js'
import { buildStateFromConfig } from './config.js'
import { createTask } from './commands.js'
import { createEmptyState } from './projection.js'
import { listOpenTasks } from './query.js'
import type { SphereId } from './ids.js'

let tempDir: string

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function makeTempStore(initialState = baseState) {
  tempDir = mkdtempSync(join(tmpdir(), 'palimpsest-test-'))
  return new FilePalimpsestStore(join(tempDir, 'events.jsonl'), initialState)
}

describe('FilePalimpsestStore', () => {
  it('returns empty array when file does not exist', async () => {
    const store = makeTempStore()
    await store.init()
    expect(await store.readAllEvents()).toEqual([])
  })

  it('round-trips task events through JSONL', async () => {
    const store = makeTempStore()
    await store.init()
    const taskEvts = createTask({ title: 'Buy groceries', sphereId })
    await store.appendEvents(taskEvts)
    const read = await store.readAllEvents()
    expect(read).toHaveLength(1)
    expect(read[0]?.type).toBe('task.created')
  })

  it('getState() reflects all appended events', async () => {
    const store = makeTempStore()
    await store.init()
    const taskEvts = createTask({ title: 'Buy groceries', sphereId })
    await store.appendEvents(taskEvts)
    const state = await store.getState()
    expect(listOpenTasks(state)).toHaveLength(1)
    expect(listOpenTasks(state)[0]?.title).toBe('Buy groceries')
  })

  it('getState() seeds spheres from initialState', async () => {
    const store = makeTempStore()
    await store.init()
    const state = await store.getState()
    expect(state.spheres.get(sphereId)?.name).toBe('Work')
  })

  it('appends multiple batches correctly', async () => {
    const store = makeTempStore()
    await store.init()
    await store.appendEvents(createTask({ title: 'Task 1', sphereId }))
    await store.appendEvents(createTask({ title: 'Task 2', sphereId }))
    expect(await store.readAllEvents()).toHaveLength(2)
    expect(listOpenTasks(await store.getState())).toHaveLength(2)
  })

  describe('subscribe()', () => {
    it('fires listener when appendEvents is called', async () => {
      const store = makeTempStore()
      await store.init()
      const listener = vi.fn()
      store.subscribe(listener)
      await store.appendEvents(createTask({ title: 'Task', sphereId }))
      expect(listener).toHaveBeenCalledOnce()
    })

    it('does not fire after unsubscribe', async () => {
      const store = makeTempStore()
      await store.init()
      const listener = vi.fn()
      const unsub = store.subscribe(listener)
      unsub()
      await store.appendEvents(createTask({ title: 'Task', sphereId }))
      expect(listener).not.toHaveBeenCalled()
    })

    it('does not fire when appendEvents receives empty array', async () => {
      const store = makeTempStore()
      await store.init()
      const listener = vi.fn()
      store.subscribe(listener)
      await store.appendEvents([])
      expect(listener).not.toHaveBeenCalled()
    })

    it('supports multiple subscribers', async () => {
      const store = makeTempStore()
      await store.init()
      const a = vi.fn()
      const b = vi.fn()
      store.subscribe(a)
      store.subscribe(b)
      await store.appendEvents(createTask({ title: 'Task', sphereId }))
      expect(a).toHaveBeenCalledOnce()
      expect(b).toHaveBeenCalledOnce()
    })
  })
})
