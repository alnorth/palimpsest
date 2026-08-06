import type { SyncState } from '@alnorth/palimpsest'
import { usePalimpsestContext } from './PalimpsestProvider.js'

export interface SyncStatus {
  syncState: SyncState | undefined
  isConnecting: boolean
  connectionError: Error | undefined
  refresh: () => Promise<void>
}

export function useSyncStatus(): SyncStatus {
  const { syncState, isLoading, connectionError, refresh } = usePalimpsestContext()
  return { syncState, isConnecting: isLoading, connectionError, refresh }
}
