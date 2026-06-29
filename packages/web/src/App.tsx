import React, { useState, useEffect, useMemo } from 'react'
import { Center, Text, Button, Stack } from '@mantine/core'
import { ClientPalimpsestStore, LocalStoragePendingEventStore } from 'palimpsest-ui-core'
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG } from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { TodoistStore } from 'palimpsest-todoist'
import { SetupScreen } from './SetupScreen.js'
import { LoadedApp } from './LoadedApp.js'

const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

function makeBackendStore(apiUrl: string, authToken: string): PalimpsestStore {
  return new ClientPalimpsestStore(
    async (clientSeq, events) => {
      const res = await fetch(`${apiUrl}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientSeq, events }),
      })
      if (!res.ok) throw new Error(`Sync failed: ${res.status} ${await res.text()}`)
      return res.json() as Promise<any>
    },
    { pendingStore: new LocalStoragePendingEventStore(), initialState: configState },
  )
}

function makeTodoistStore(todoistToken: string): PalimpsestStore {
  return new TodoistStore(todoistToken, {
    pendingStore: new LocalStoragePendingEventStore('palimpsest_todoist_pending'),
    configState,
  })
}

export function App() {
  // undefined = still fetching, null = not available (local dev), string = from deployment
  const [configApiUrl, setConfigApiUrl] = useState<string | null | undefined>(undefined)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('palimpsest_auth_token'))
  const [manualApiUrl, setManualApiUrl] = useState(() => localStorage.getItem('palimpsest_api_url'))
  const [todoistToken, setTodoistToken] = useState(() => localStorage.getItem('palimpsest_todoist_token'))
  const [initialState, setInitialState] = useState<ProjectionState | undefined>(undefined)
  const [initError, setInitError] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch('/config.json')
      .then(r => r.ok ? r.json() as Promise<{ apiUrl?: string }> : Promise.reject())
      .then(cfg => setConfigApiUrl(cfg.apiUrl ?? null))
      .catch(() => setConfigApiUrl(null))
  }, [])

  const apiUrl = configApiUrl ?? manualApiUrl

  const store = useMemo((): PalimpsestStore | null => {
    if (todoistToken) return makeTodoistStore(todoistToken)
    if (apiUrl && authToken) return makeBackendStore(apiUrl, authToken)
    return null
  }, [todoistToken, apiUrl, authToken])

  useEffect(() => {
    if (store === null) { setInitialState(undefined); setInitError(undefined); return }
    let cancelled = false
    store.init()
      .then(() => store.getState())
      .then(state => { if (!cancelled) setInitialState(state) })
      .catch(err => { if (!cancelled) setInitError(err instanceof Error ? err.message : 'Connection failed') })
    return () => { cancelled = true }
  }, [store])

  if (configApiUrl === undefined) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Loading…</Text>
      </Center>
    )
  }

  if (!todoistToken && (!apiUrl || !authToken)) {
    return (
      <SetupScreen
        configApiUrl={configApiUrl}
        onSave={() => {
          setTodoistToken(localStorage.getItem('palimpsest_todoist_token'))
          setAuthToken(localStorage.getItem('palimpsest_auth_token'))
          if (configApiUrl === null) setManualApiUrl(localStorage.getItem('palimpsest_api_url'))
        }}
      />
    )
  }

  function handleLogout() {
    localStorage.removeItem('palimpsest_todoist_token')
    localStorage.removeItem('palimpsest_auth_token')
    localStorage.removeItem('palimpsest_api_url')
    setTodoistToken(null)
    setAuthToken(null)
    setManualApiUrl(null)
    setInitialState(undefined)
    setInitError(undefined)
  }

  if (initError !== undefined) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Text c="red" style={{ fontFamily: 'monospace' }}>{initError}</Text>
          <Button variant="subtle" color="red" size="sm" onClick={handleLogout} style={{ fontFamily: 'monospace' }}>
            Log out
          </Button>
        </Stack>
      </Center>
    )
  }

  if (initialState === undefined) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Connecting…</Text>
      </Center>
    )
  }

  return <LoadedApp store={store!} initialState={initialState} onLogout={handleLogout} />
}
