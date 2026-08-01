import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { FilePalimpsestStore, buildStateFromConfig, PALIMPSEST_CONFIG, createEmptyState } from 'palimpsest'
import type { PalimpsestStore } from 'palimpsest'
import { ClientPalimpsestStore } from 'palimpsest-ui-core'
import { TodoistStore } from 'palimpsest-todoist'
import { FilePendingEventStore } from './FilePendingEventStore.js'

export function createStore(env: NodeJS.ProcessEnv = process.env): PalimpsestStore {
  const todoistToken = env['PALIMPSEST_TODOIST_TOKEN']
  const apiUrl = env['PALIMPSEST_API_URL']
  const authToken = env['PALIMPSEST_AUTH_TOKEN']

  const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

  if (todoistToken !== undefined) {
    const pendingPath = join(homedir(), '.palimpsest', 'todoist-pending.json')
    mkdirSync(dirname(pendingPath), { recursive: true })
    return new TodoistStore(todoistToken, { pendingStore: new FilePendingEventStore(pendingPath), initialState: configState })
  }

  if (apiUrl !== undefined && authToken !== undefined) {
    const pendingPath = join(homedir(), '.palimpsest', 'pending.json')
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
      { pendingStore: new FilePendingEventStore(pendingPath), initialState: configState },
    )
  }

  const filePath = env['PALIMPSEST_FILE'] ?? join(homedir(), '.palimpsest', 'events.jsonl')
  mkdirSync(dirname(filePath), { recursive: true })
  return new FilePalimpsestStore(filePath, configState)
}
