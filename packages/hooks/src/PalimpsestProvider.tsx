import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PalimpsestStore, ProjectionState, SphereId, SyncState } from '@alnorth/palimpsest'
import { TodoistStore } from '@alnorth/palimpsest-todoist'

interface HasSyncState {
  readonly syncState: SyncState
}

function hasSyncState(store: PalimpsestStore): store is PalimpsestStore & HasSyncState {
  return 'syncState' in store
}

interface HasRefresh {
  refresh: () => Promise<void>
}

function hasRefresh(store: PalimpsestStore): store is PalimpsestStore & HasRefresh {
  return typeof (store as Partial<HasRefresh>).refresh === 'function'
}

function defaultToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface PalimpsestContextValue {
  store: PalimpsestStore
  projState: ProjectionState | undefined
  isLoading: boolean
  connectionError: Error | undefined
  syncState: SyncState | undefined
  refresh: () => Promise<void>
  currentSphereId: SphereId | undefined
  setCurrentSphere: (id: string | undefined) => void
  today: string
}

const PalimpsestContext = createContext<PalimpsestContextValue | undefined>(undefined)

export function usePalimpsestContext(): PalimpsestContextValue {
  const ctx = useContext(PalimpsestContext)
  if (ctx === undefined) {
    throw new Error('usePalimpsestContext must be used within a <PalimpsestProvider>')
  }
  return ctx
}

export type PalimpsestProviderProps =
  { children: ReactNode; initialSphere?: string; today?: string } &
  ( { store: PalimpsestStore } | { todoistToken: string; syncIntervalMs?: number } )

export function PalimpsestProvider(props: PalimpsestProviderProps): ReactNode {
  const { children, initialSphere, today } = props

  const store = useMemo<PalimpsestStore>(() => {
    if ('store' in props) return props.store
    return new TodoistStore(props.todoistToken, {
      ...(props.syncIntervalMs !== undefined && { syncIntervalMs: props.syncIntervalMs }),
    })
  }, [
    'store' in props ? props.store : undefined,
    'todoistToken' in props ? props.todoistToken : undefined,
    'syncIntervalMs' in props ? props.syncIntervalMs : undefined,
  ])

  const [projState, setProjState] = useState<ProjectionState | undefined>(undefined)
  const [syncState, setSyncState] = useState<SyncState | undefined>(undefined)
  const [connectionError, setConnectionError] = useState<Error | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [currentSphereId, setCurrentSphereIdState] = useState<SphereId | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setConnectionError(undefined)
    store.init().then(() => store.getState())
      .then(state => {
        if (cancelled) return
        setProjState(state)
        setIsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setConnectionError(error instanceof Error ? error : new Error(String(error)))
        setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [store])

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      void store.getState().then(setProjState).catch(() => {})
      if (hasSyncState(store)) setSyncState(store.syncState)
    })
    store.start()
    return () => {
      unsubscribe()
      store.stop()
    }
  }, [store])

  useEffect(() => {
    if (initialSphere === undefined || projState === undefined || currentSphereId !== undefined) return
    const match = [...projState.spheres.values()].find(
      s => s.id === initialSphere || s.name.toLowerCase() === initialSphere.toLowerCase(),
    )
    if (match !== undefined) setCurrentSphereIdState(match.id)
  }, [initialSphere, projState, currentSphereId])

  function setCurrentSphere(id: string | undefined): void {
    setCurrentSphereIdState(id as SphereId | undefined)
  }

  async function refresh(): Promise<void> {
    if (hasRefresh(store)) {
      await store.refresh()
    } else {
      setProjState(await store.getState())
    }
  }

  const value: PalimpsestContextValue = {
    store,
    projState,
    isLoading,
    connectionError,
    syncState,
    refresh,
    currentSphereId,
    setCurrentSphere,
    today: today ?? defaultToday(),
  }

  return <PalimpsestContext.Provider value={value}>{children}</PalimpsestContext.Provider>
}
