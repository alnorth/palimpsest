import { use, useMemo } from 'react'
import type { ParsedCommand } from '@alnorth/palimpsest-query'
import { runQuery } from '@alnorth/palimpsest-query'
import { TodoistStore, attachTodoistUrls } from '@alnorth/palimpsest-todoist'
import { usePalimpsestContext } from '../PalimpsestProvider'

export function useRunQuery(command: ParsedCommand | undefined): Record<string, unknown> | undefined {
  const { store, stateResource, projState: mirroredProjState, today } = usePalimpsestContext()
  const commandKey = command !== undefined ? JSON.stringify(command) : undefined
  // Todoist ids are used verbatim as palimpsest ids (see @alnorth/palimpsest-todoist's mapping.ts),
  // so a todoistUrl is only ever meaningful when this Provider is backed by a TodoistStore — not
  // for e.g. ClientPalimpsestStore, whose ids are unrelated to Todoist.
  const isTodoistBacked = store instanceof TodoistStore

  // use() is called conditionally on purpose (allowed for use, unlike other hooks): with no
  // command there's nothing to query, so a store that hasn't connected yet must not be forced to
  // suspend (see useDashboard/usePickList's "no sphere resolved" branch). And once the plain
  // mirror is populated, we read that directly forever after rather than calling use() again on
  // every update — see the doc comment on PalimpsestContextValue.stateResource for why.
  const projState = command === undefined
    ? undefined
    : mirroredProjState !== undefined ? mirroredProjState : use(stateResource)

  return useMemo(() => {
    if (command === undefined || projState === undefined) return undefined
    const raw = runQuery(projState, command, { today })
    return isTodoistBacked ? attachTodoistUrls(raw) : raw
    // commandKey stands in for `command` (a fresh object literal on every render) so the memo only
    // recomputes when the filter's actual content changes, not on every render. `command` itself
    // is deliberately excluded from the deps array — including it would defeat this entirely,
    // since a structurally-identical-but-new object always has a different reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, today, commandKey, isTodoistBacked])
}
