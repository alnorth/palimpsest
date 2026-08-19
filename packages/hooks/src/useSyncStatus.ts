import type { SyncState } from '@alnorth/palimpsest'
import { usePalimpsestContext } from './PalimpsestProvider'

export interface SyncStatus {
  syncState: SyncState | undefined
  isConnecting: boolean
  connectionError: Error | undefined
  refresh: () => Promise<void>
}

export function useSyncStatus(): SyncStatus {
  const { syncState, isConnecting, connectionError, refresh } = usePalimpsestContext()
  return { syncState, isConnecting, connectionError, refresh }
}
