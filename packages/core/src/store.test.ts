import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilePalimpsestStore } from './store.js'
import { createSphere, createTask } from './commands.js'
import { createEmptyState, project } from './projection.js'
import { listOpenTasks } from './query.js'
import type { SphereId } from './ids.js'

let tempDir: string

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

function makeTempStore() {
  tempDir = mkdtempSync(join(tmpdir(), 'palimpsest-test-'))
  return new FilePalimpsestStore(join(tempDir, 'events.jsonl'))
}

describe('FilePalimpsestStore', () => {
  it('returns empty array when file does not exist', () => {
    const store = makeTempStore()
    expect(store.readAllEvents()).toEqual([])
  })

  it('round-trips events through JSONL', () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    store.appendEvents(sphereEvts)
    const read = store.readAllEvents()
    expect(read).toHaveLength(1)
    expect(read[0]?.type).toBe('sphere.created')
  })

  it('getState() reflects all appended events', () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    store.appendEvents(sphereEvts)

    const s1 = store.getState()
    const sphereId = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'Buy groceries', sphereId })
    store.appendEvents(taskEvts)

    const state = store.getState()
    expect(listOpenTasks(state)).toHaveLength(1)
    expect(listOpenTasks(state)[0]?.title).toBe('Buy groceries')
  })

  it('appends multiple batches correctly', () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    store.appendEvents(sphereEvts)
    const s1 = store.getState()
    const sid = (sphereEvts[0] as any).sphereId as SphereId

    store.appendEvents(createTask(s1, { title: 'Task 1', sphereId: sid }))
    store.appendEvents(createTask(s1, { title: 'Task 2', sphereId: sid }))

    expect(store.readAllEvents()).toHaveLength(3)
    expect(listOpenTasks(store.getState())).toHaveLength(2)
  })
})
