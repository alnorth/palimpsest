// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { TodoistStore } from '@alnorth/palimpsest-todoist'
import { makeSphere, makeTask, buildState } from '../testFixtures'
import { FakeStore, makeWrapper } from '../testHelpers'
import { useRunQuery } from './useRunQuery'

// A Todoist-backed one-offs project id (see @alnorth/palimpsest-todoist's mapping.ts) — a task
// filed here resolves straight to a sphere via its label, with no other projects needed in the
// sync response.
const TODOIST_WORK_ONEOFFS_ID = '6JJ5W472RVPP7rWq'

describe('useRunQuery — todoistUrl attachment', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('attaches todoistUrl to tasks when the store is Todoist-backed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      sync_token: 'tok',
      full_sync: true,
      items: [{
        id: 't1', content: 'Ship it', description: '', project_id: TODOIST_WORK_ONEOFFS_ID,
        labels: [], priority: 1, due: null, checked: false, is_deleted: false,
        added_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', completed_at: null,
      }],
      projects: [],
    }), { status: 200 })))

    const store = new TodoistStore('token')
    const { result } = renderHook(() => useRunQuery({ kind: 'tasks' }), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.raw).toBeDefined())
    const tasks = result.current.raw?.['tasks'] as { todoistUrl?: string }[]
    expect(tasks[0]?.todoistUrl).toBe('https://todoist.com/app/task/t1')
  })

  test('does not attach todoistUrl for a non-Todoist store', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => useRunQuery({ kind: 'tasks' }), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.raw).toBeDefined())
    const tasks = result.current.raw?.['tasks'] as { todoistUrl?: string }[]
    expect(tasks[0]?.todoistUrl).toBeUndefined()
  })
})
