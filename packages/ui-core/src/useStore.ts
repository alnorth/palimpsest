import { useState, useEffect } from 'react'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import type { SyncState } from './ClientPalimpsestStore.js'
import { INITIAL_SYNC_STATE } from './ClientPalimpsestStore.js'

interface HasSyncState {
  readonly syncState: SyncState
}

function hasSyncState(store: PalimpsestStore): store is PalimpsestStore & HasSyncState {
  return 'syncState' in store
}

export interface StoreState {
  projState: ProjectionState
  syncState: SyncState
}

export function useStore(store: PalimpsestStore, initialState: ProjectionState): StoreState {
  const [projState, setProjState] = useState<ProjectionState>(initialState)
  const [syncState, setSyncState] = useState<SyncState>(INITIAL_SYNC_STATE)

  useEffect(() => {
    const unsub = store.subscribe(() => {
      void store.getState().then(setProjState).catch(() => {})
      if (hasSyncState(store)) setSyncState(store.syncState)
    })
    store.start()
    return () => {
      unsub()
      store.stop()
    }
  }, [store])

  return { projState, syncState }
}
