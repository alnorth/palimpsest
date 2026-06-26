// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'
import { ClientPalimpsestStore } from './ClientPalimpsestStore.js'
import { INITIAL_SYNC_STATE } from './ClientPalimpsestStore.js'
import { createEmptyState, buildStateFromConfig } from 'palimpsest'
import type { PalimpsestStore, ProjectionState, SphereId } from 'palimpsest'

const SPHERE_ID = 'sph1' as SphereId
const initialState: ProjectionState = {
  ...createEmptyState(),
  ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]),
}

function makePassthroughSyncFn() {
  return vi.fn(async () => ({ status: 'ok' as const, serverSeq: 0, missedEvents: [] }))
}

class FakeStore implements PalimpsestStore {
  private listeners = new Set<() => void>()
  private _state: ProjectionState = initialState
  started = false
  stopped = false
  subscribeCount = 0

  subscribe(cb: () => void): () => void {
    this.subscribeCount++
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  notify() {
    for (const cb of this.listeners) cb()
  }

  setState(s: ProjectionState) { this._state = s }

  async getState(): Promise<ProjectionState> { return this._state }
  async readAllEvents() { return [] }
  async appendEvents() {}
  async init() {}
  start() { this.started = true }
  stop() { this.stopped = true }
}

describe('useStore', () => {
  describe('projState', () => {
    it('initialises to initialState', () => {
      const store = new FakeStore()
      const { result } = renderHook(() => useStore(store, initialState))
      expect(result.current.projState).toBe(initialState)
    })

    it('updates when the store notifies', async () => {
      const store = new FakeStore()
      const { result } = renderHook(() => useStore(store, initialState))
      const newState = { ...initialState }
      store.setState(newState)
      await act(async () => { store.notify() })
      expect(result.current.projState).toBe(newState)
    })
  })

  describe('syncState', () => {
    it('initialises to INITIAL_SYNC_STATE for a plain store', () => {
      const store = new FakeStore()
      const { result } = renderHook(() => useStore(store, initialState))
      expect(result.current.syncState).toEqual(INITIAL_SYNC_STATE)
    })

    it('picks up syncState from a ClientPalimpsestStore on notification', async () => {
      const store = new ClientPalimpsestStore(makePassthroughSyncFn(), { initialState })
      const { result } = renderHook(() => useStore(store, initialState))
      await act(async () => { await store.sync() })
      expect(result.current.syncState.health).toBe('idle')
    })

    it('reflects error health after a failed sync', async () => {
      const store = new ClientPalimpsestStore(
        vi.fn().mockRejectedValue(new Error('network')),
        { initialState },
      )
      const { result } = renderHook(() => useStore(store, initialState))
      await act(async () => { await store.sync() })
      expect(result.current.syncState.health).toBe('error')
      expect(result.current.syncState.lastError).toBe('network')
    })
  })

  describe('lifecycle', () => {
    it('calls store.start() on mount', () => {
      const store = new FakeStore()
      renderHook(() => useStore(store, initialState))
      expect(store.started).toBe(true)
    })

    it('calls store.stop() on unmount', () => {
      const store = new FakeStore()
      const { unmount } = renderHook(() => useStore(store, initialState))
      unmount()
      expect(store.stopped).toBe(true)
    })

    it('unsubscribes from the store on unmount', () => {
      const store = new FakeStore()
      const { unmount } = renderHook(() => useStore(store, initialState))
      unmount()
      store.notify()
      expect(store.subscribeCount).toBe(1)
    })
  })
})
