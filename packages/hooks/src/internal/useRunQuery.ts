import { useMemo } from 'react'
import type { ParsedCommand } from '@alnorth/palimpsest-query'
import { runQuery } from '@alnorth/palimpsest-query'
import { TodoistStore, attachTodoistUrls } from '@alnorth/palimpsest-todoist'
import { usePalimpsestContext } from '../PalimpsestProvider'

export interface RawQueryState {
  raw: Record<string, unknown> | undefined
  isLoading: boolean
  error: Error | undefined
}

export function useRunQuery(command: ParsedCommand | undefined): RawQueryState {
  const { store, projState, isLoading: contextLoading, connectionError, today } = usePalimpsestContext()
  const commandKey = command !== undefined ? JSON.stringify(command) : undefined
  // Todoist ids are used verbatim as palimpsest ids (see @alnorth/palimpsest-todoist's mapping.ts),
  // so a todoistUrl is only ever meaningful when this Provider is backed by a TodoistStore — not
  // for e.g. ClientPalimpsestStore, whose ids are unrelated to Todoist.
  const isTodoistBacked = store instanceof TodoistStore

  return useMemo(() => {
    if (contextLoading) return { raw: undefined, isLoading: true, error: undefined }
    if (connectionError !== undefined) return { raw: undefined, isLoading: false, error: connectionError }
    if (command === undefined || projState === undefined) {
      return { raw: undefined, isLoading: false, error: undefined }
    }
    try {
      const raw = runQuery(projState, command, { today })
      return { raw: isTodoistBacked ? attachTodoistUrls(raw) : raw, isLoading: false, error: undefined }
    } catch (error) {
      return { raw: undefined, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
    // commandKey stands in for `command` (a fresh object literal on every render) so the memo only
    // recomputes when the filter's actual content changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, contextLoading, connectionError, today, commandKey, isTodoistBacked])
}
