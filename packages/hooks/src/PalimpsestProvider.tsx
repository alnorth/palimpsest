import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PalimpsestStore, ProjectionState, SphereId, SyncState } from '@alnorth/palimpsest'
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG } from '@alnorth/palimpsest'
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

  /** use(stateResource) suspends until the store's first connect settles; rejects (and thus
   *  throws via use(), caught by the app's own <ErrorBoundary>) if the initial
   *  store.init()/getState() fails. Consumers should call use() on this ONLY while `projState`
   *  below is still undefined — once a value exists, read that directly instead. Passing a fresh
   *  Promise.resolve(state) to use() on every live update was tried and rejected: even an
   *  already-fulfilled promise costs a real (if brief) suspend/resume cycle the first time use()
   *  sees that particular promise object, since React can't know it's settled without a microtask
   *  round trip — so every live update would flash the Suspense fallback. Reading the plain mirror
   *  instead avoids ever calling use() again after the first connect. */
  stateResource: Promise<ProjectionState>

  /** Mirror of stateResource's resolved value, kept live by every store update (not just the
   *  first). undefined until the first connect resolves; never throws. This is what every read
   *  hook should use once defined, and what non-render-phase consumers (useMutation's mutate
   *  callback, an event handler that can't suspend) always use. */
  projState: ProjectionState | undefined

  isConnecting: boolean
  connectionError: Error | undefined
  syncState: SyncState | undefined
  refresh: () => Promise<void>
  currentSphereId: SphereId | undefined
  setCurrentSphere: (id: string | undefined) => void
  today: string
}

function connect(store: PalimpsestStore): Promise<ProjectionState> {
  return store.init().then(() => store.getState())
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
      initialState: { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) },
      ...(props.syncIntervalMs !== undefined && { syncIntervalMs: props.syncIntervalMs }),
    })
  }, [
    'store' in props ? props.store : undefined,
    'todoistToken' in props ? props.todoistToken : undefined,
    'syncIntervalMs' in props ? props.syncIntervalMs : undefined,
  ])

  const [stateResource, setStateResource] = useState<Promise<ProjectionState>>(() => connect(store))
  const [projState, setProjState] = useState<ProjectionState | undefined>(undefined)
  const [syncState, setSyncState] = useState<SyncState | undefined>(undefined)
  const [connectionError, setConnectionError] = useState<Error | undefined>(undefined)
  const [isConnecting, setIsConnecting] = useState(true)
  const [currentSphereId, setCurrentSphereIdState] = useState<SphereId | undefined>(undefined)

  // Guards against calling connect(store) twice on the very first mount: the lazy useState
  // initializer above already started one for this exact `store`. Seeding the ref with the
  // initial `store` (rather than undefined) means the first effect run recognizes "this is the
  // store the lazy initializer already connected" and reuses that promise; a later run (triggered
  // by `store` actually changing identity) sees a mismatch and reconnects for real.
  const connectedStoreRef = useRef<PalimpsestStore>(store)

  useEffect(() => {
    let cancelled = false
    setIsConnecting(true)
    setConnectionError(undefined)
    const promise = connectedStoreRef.current === store ? stateResource : connect(store)
    connectedStoreRef.current = store
    if (promise !== stateResource) setStateResource(promise)
    promise
      .then(state => {
        if (cancelled) return
        setProjState(state)
        setIsConnecting(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setConnectionError(error instanceof Error ? error : new Error(String(error)))
        setIsConnecting(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    stateResource,
    projState,
    isConnecting,
    connectionError,
    syncState,
    refresh,
    currentSphereId,
    setCurrentSphere,
    today: today ?? defaultToday(),
  }

  return <PalimpsestContext.Provider value={value}>{children}</PalimpsestContext.Provider>
}
