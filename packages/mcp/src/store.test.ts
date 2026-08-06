import { describe, test, expect, vi, afterEach } from 'vitest'
import { TodoistStore } from '@alnorth/palimpsest-todoist'
import { createStore } from './store.js'

describe('createStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('throws a readable error when PALIMPSEST_TODOIST_TOKEN is not set', () => {
    expect(() => createStore({})).toThrow(/PALIMPSEST_TODOIST_TOKEN/)
  })

  test('builds a TodoistStore using the token from the environment', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      sync_token: 'tok-after-sync',
      full_sync: true,
      items: [],
      projects: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const store = createStore({ PALIMPSEST_TODOIST_TOKEN: 'secret-token' })
    expect(store).toBeInstanceOf(TodoistStore)

    await store.init()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    if (call === undefined) throw new Error('fetch was not called')
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer secret-token')
  })
})
