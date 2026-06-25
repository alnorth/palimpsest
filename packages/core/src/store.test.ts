import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilePalimpsestStore } from './store.js'
import { createSphere, createTask } from './commands.js'
import { createEmptyState } from './projection.js'
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
  it('returns empty array when file does not exist', async () => {
    const store = makeTempStore()
    expect(await store.readAllEvents()).toEqual([])
  })

  it('round-trips events through JSONL', async () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    await store.appendEvents(sphereEvts)
    const read = await store.readAllEvents()
    expect(read).toHaveLength(1)
    expect(read[0]?.type).toBe('sphere.created')
  })

  it('getState() reflects all appended events', async () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    await store.appendEvents(sphereEvts)

    const s1 = await store.getState()
    const sphereId = (sphereEvts[0] as any).sphereId as SphereId
    const taskEvts = createTask(s1, { title: 'Buy groceries', sphereId })
    await store.appendEvents(taskEvts)

    const state = await store.getState()
    expect(listOpenTasks(state)).toHaveLength(1)
    expect(listOpenTasks(state)[0]?.title).toBe('Buy groceries')
  })

  it('appends multiple batches correctly', async () => {
    const store = makeTempStore()
    const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
    await store.appendEvents(sphereEvts)
    const s1 = await store.getState()
    const sid = (sphereEvts[0] as any).sphereId as SphereId

    await store.appendEvents(createTask(s1, { title: 'Task 1', sphereId: sid }))
    await store.appendEvents(createTask(s1, { title: 'Task 2', sphereId: sid }))

    expect(await store.readAllEvents()).toHaveLength(3)
    expect(listOpenTasks(await store.getState())).toHaveLength(2)
  })
})
