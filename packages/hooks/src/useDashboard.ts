import type { TaskJson } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useRunQuery } from './internal/useRunQuery'
import type { ListResult } from './types'

export function useDashboard(sphere?: string): ListResult<TaskJson> {
  const { currentSphereId } = usePalimpsestContext()
  const resolvedSphere = sphere ?? currentSphereId
  const command = resolvedSphere !== undefined ? { kind: 'dashboard' as const, sphere: resolvedSphere } : undefined
  const { raw, isLoading, error } = useRunQuery(command)

  if (resolvedSphere === undefined) {
    return { data: [], isLoading: false, error: undefined, total: 0, truncated: false }
  }

  return {
    data: raw !== undefined ? raw.tasks as TaskJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
