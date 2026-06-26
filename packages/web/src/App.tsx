import React, { useState, useEffect, useMemo } from 'react'
import { Center, Text } from '@mantine/core'
import { ClientPalimpsestStore, LocalStoragePendingEventStore } from 'palimpsest-ui-core'
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG } from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { SetupScreen } from './SetupScreen.js'
import { LoadedApp } from './LoadedApp.js'

const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

function makeStore(apiUrl: string, authToken: string): PalimpsestStore {
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

export function App() {
  // undefined = still fetching, null = not available (local dev), string = from deployment
  const [configApiUrl, setConfigApiUrl] = useState<string | null | undefined>(undefined)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('palimpsest_auth_token'))
  const [manualApiUrl, setManualApiUrl] = useState(() => localStorage.getItem('palimpsest_api_url'))
  const [initialState, setInitialState] = useState<ProjectionState | undefined>(undefined)

  useEffect(() => {
    fetch('/config.json')
      .then(r => r.ok ? r.json() as Promise<{ apiUrl?: string }> : Promise.reject())
      .then(cfg => setConfigApiUrl(cfg.apiUrl ?? null))
      .catch(() => setConfigApiUrl(null))
  }, [])

  const apiUrl = configApiUrl ?? manualApiUrl

  const store = useMemo(
    () => (apiUrl && authToken ? makeStore(apiUrl, authToken) : null),
    [apiUrl, authToken],
  )

  useEffect(() => {
    if (store === null) { setInitialState(undefined); return }
    let cancelled = false
    void store.init()
      .catch(() => {})
      .then(() => store.getState())
      .then(state => { if (!cancelled) setInitialState(state) })
      .catch(() => { if (!cancelled) setInitialState(configState) })
    return () => { cancelled = true }
  }, [store])

  if (configApiUrl === undefined) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Loading…</Text>
      </Center>
    )
  }

  if (!apiUrl || !authToken) {
    return (
      <SetupScreen
        configApiUrl={configApiUrl}
        onSave={() => {
          setAuthToken(localStorage.getItem('palimpsest_auth_token'))
          if (configApiUrl === null) setManualApiUrl(localStorage.getItem('palimpsest_api_url'))
        }}
      />
    )
  }

  if (initialState === undefined) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Connecting…</Text>
      </Center>
    )
  }

  return <LoadedApp store={store!} initialState={initialState} />
}
