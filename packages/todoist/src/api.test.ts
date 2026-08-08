import { describe, test, expect, vi, afterEach } from 'vitest'
import { sync } from './api'

describe('sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('resolves normally when the request succeeds before the timeout', async () => {
    const body = { sync_token: 'tok', full_sync: false, items: [], projects: [] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

    const result = await sync('token', { syncToken: '*', commands: [] })
    expect(result).toEqual(body)
  })

  // A stalled connection otherwise leaves fetch()'s promise unsettled forever — this reproduces
  // that by never resolving/rejecting except in response to the AbortSignal, the way a real hung
  // request only ever settles via abort.
  test('rejects instead of hanging forever when the request stalls', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })))

    const promise = sync('token', { syncToken: '*', commands: [] })
    const assertion = expect(promise).rejects.toThrow(/timed out after 20000ms/)
    await vi.advanceTimersByTimeAsync(20_000)
    await assertion
  })
})
