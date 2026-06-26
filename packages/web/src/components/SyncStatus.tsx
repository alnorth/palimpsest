import React from 'react'
import { Text } from '@mantine/core'
import type { SyncState } from 'palimpsest-ui-core'

interface Props {
  syncState: SyncState
}

export function SyncStatus({ syncState }: Props) {
  const { health, unsyncedCount, pendingConflicts, lastError } = syncState
  if (health === 'error') {
    return <Text size="sm" c="red">sync error: {lastError ?? 'unknown'} — changes saved locally, will retry</Text>
  }
  if (health === 'conflict') {
    return <Text size="sm" c="red">conflict: {pendingConflicts[0]?.reason ?? 'unknown'}</Text>
  }
  if (unsyncedCount > 0) {
    return <Text size="sm" c="dimmed">{unsyncedCount} unsynced</Text>
  }
  return null
}
