import type { TaskJson } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useRunQuery } from './internal/useRunQuery'
import type { Paginated } from './types'

export function useDashboard(sphere?: string): Paginated<TaskJson> {
  const { currentSphereId } = usePalimpsestContext()
  const resolvedSphere = sphere ?? currentSphereId
  const command = resolvedSphere !== undefined ? { kind: 'dashboard' as const, sphere: resolvedSphere } : undefined
  const raw = useRunQuery(command)

  if (resolvedSphere === undefined) {
    return { items: [], total: 0, truncated: false }
  }

  return {
    items: (raw?.tasks ?? []) as TaskJson[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
