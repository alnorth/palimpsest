import { describe, test, expect } from 'vitest'
import { PalimpsestStore } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState } from 'palimpsest'
import { makeSphere, makeTask, buildState } from './fixtures.js'
import { runCli } from './run.js'

class FakeStore extends PalimpsestStore {
  constructor(private state: ProjectionState) { super() }
  override async init(): Promise<void> {}
  override async getState(): Promise<ProjectionState> { return this.state }
  readAllEvents(): Promise<PalimpsestEvent[]> { return Promise.resolve([]) }
  protected doAppend(): Promise<void> { return Promise.resolve() }
}

class FailingInitStore extends PalimpsestStore {
  override async init(): Promise<void> { throw new Error('Connection failed') }
  override async getState(): Promise<ProjectionState> { throw new Error('should not be called') }
  readAllEvents(): Promise<PalimpsestEvent[]> { return Promise.resolve([]) }
  protected doAppend(): Promise<void> { return Promise.resolve() }
}

function makeWriters() {
  let out = ''
  let err = ''
  return {
    stdout: (s: string) => { out += s },
    stderr: (s: string) => { err += s },
    get out() { return out },
    get err() { return err },
  }
}

describe('runCli', () => {
  test('success: JSON on stdout, empty stderr, exit 0', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const state = buildState({ spheres: [sphere], tasks: [task] })
    const writers = makeWriters()

    const code = await runCli(['tasks'], { createStore: () => new FakeStore(state), ...writers, today: '2026-08-01' })

    expect(code).toBe(0)
    expect(writers.err).toBe('')
    const parsed = JSON.parse(writers.out) as { ok: boolean; tasks: { title: string }[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Ship it'])
  })

  test('domain error (unresolved sphere name): empty stdout, message on stderr, exit 1', async () => {
    const state = buildState({ spheres: [makeSphere({ name: 'Work' })] })
    const writers = makeWriters()

    const code = await runCli(['tasks', '--sphere', 'Nope'], { createStore: () => new FakeStore(state), ...writers })

    expect(code).toBe(1)
    expect(writers.out).toBe('')
    expect(writers.err).toMatch(/No sphere matching "Nope"/)
  })

  test('store init failure: empty stdout, message on stderr, exit 1', async () => {
    const writers = makeWriters()

    const code = await runCli(['tasks'], { createStore: () => new FailingInitStore(), ...writers })

    expect(code).toBe(1)
    expect(writers.out).toBe('')
    expect(writers.err).toMatch(/Connection failed/)
  })

  test('unknown subcommand: usage error, nonzero exit, no store touched', async () => {
    const writers = makeWriters()
    let storeCreated = false

    const code = await runCli(['bogus'], { createStore: () => { storeCreated = true; return new FailingInitStore() }, ...writers })

    expect(code).not.toBe(0)
    expect(storeCreated).toBe(false)
  })

  test('--help exits 0 with usage on stdout, store never touched', async () => {
    const writers = makeWriters()
    let storeCreated = false

    const code = await runCli(['--help'], { createStore: () => { storeCreated = true; return new FailingInitStore() }, ...writers })

    expect(code).toBe(0)
    expect(writers.out).toMatch(/Usage:/)
    expect(storeCreated).toBe(false)
  })

  test('task <id> not found: exit 1 with a readable message', async () => {
    const state = buildState({})
    const writers = makeWriters()

    const code = await runCli(['task', 'missing-id'], { createStore: () => new FakeStore(state), ...writers })

    expect(code).toBe(1)
    expect(writers.out).toBe('')
    expect(writers.err).toMatch(/No task with id "missing-id"/)
  })
})
