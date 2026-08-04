import { useMemo } from 'react'
import type { ParsedCommand } from 'palimpsest-query'
import { runQuery } from 'palimpsest-query'
import { usePalimpsestContext } from '../PalimpsestProvider.js'

export interface RawQueryState {
  raw: Record<string, unknown> | undefined
  isLoading: boolean
  error: Error | undefined
}

export function useRunQuery(command: ParsedCommand | undefined): RawQueryState {
  const { projState, isLoading: contextLoading, connectionError, today } = usePalimpsestContext()
  const commandKey = command !== undefined ? JSON.stringify(command) : undefined

  return useMemo(() => {
    if (contextLoading) return { raw: undefined, isLoading: true, error: undefined }
    if (connectionError !== undefined) return { raw: undefined, isLoading: false, error: connectionError }
    if (command === undefined || projState === undefined) {
      return { raw: undefined, isLoading: false, error: undefined }
    }
    try {
      return { raw: runQuery(projState, command, { today }), isLoading: false, error: undefined }
    } catch (error) {
      return { raw: undefined, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
    // commandKey stands in for `command` (a fresh object literal on every render) so the memo only
    // recomputes when the filter's actual content changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, contextLoading, connectionError, today, commandKey])
}
