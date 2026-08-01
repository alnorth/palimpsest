import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilePalimpsestStore } from 'palimpsest'
import { ClientPalimpsestStore } from 'palimpsest-ui-core'
import { TodoistStore } from 'palimpsest-todoist'
import { createStore } from './store.js'

function withTempHome(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'palimpsest-test-'))
    const originalHome = process.env['HOME']
    process.env['HOME'] = dir
    try {
      await fn(dir)
    } finally {
      if (originalHome !== undefined) process.env['HOME'] = originalHome
      else delete process.env['HOME']
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

describe('createStore', () => {
  it('selects TodoistStore when PALIMPSEST_TODOIST_TOKEN is set', withTempHome(async () => {
    const store = createStore({ PALIMPSEST_TODOIST_TOKEN: 'tok' })
    expect(store).toBeInstanceOf(TodoistStore)
  }))

  it('selects ClientPalimpsestStore when PALIMPSEST_API_URL and PALIMPSEST_AUTH_TOKEN are set', withTempHome(async () => {
    const store = createStore({ PALIMPSEST_API_URL: 'https://example.test', PALIMPSEST_AUTH_TOKEN: 'secret' })
    expect(store).toBeInstanceOf(ClientPalimpsestStore)
  }))

  it('falls back to FilePalimpsestStore when no store env vars are set', withTempHome(async dir => {
    const filePath = join(dir, 'events.jsonl')
    const store = createStore({ PALIMPSEST_FILE: filePath })
    expect(store).toBeInstanceOf(FilePalimpsestStore)
    expect((store as FilePalimpsestStore).filePath).toBe(filePath)
  }))

  it('the todoist token takes precedence over the remote api url', withTempHome(async () => {
    const store = createStore({
      PALIMPSEST_TODOIST_TOKEN: 'tok',
      PALIMPSEST_API_URL: 'https://example.test',
      PALIMPSEST_AUTH_TOKEN: 'secret',
    })
    expect(store).toBeInstanceOf(TodoistStore)
  }))

  it('PALIMPSEST_API_URL alone (no auth token) falls back to the file store', withTempHome(async dir => {
    const filePath = join(dir, 'events.jsonl')
    const store = createStore({ PALIMPSEST_API_URL: 'https://example.test', PALIMPSEST_FILE: filePath })
    expect(store).toBeInstanceOf(FilePalimpsestStore)
  }))
})
