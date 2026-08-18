import type { TaskJson } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useRunQuery } from './internal/useRunQuery'
import { toPaginated } from './internal/toPaginated'
import type { Paginated } from './types'

export function useDashboard(sphere?: string): Paginated<TaskJson> {
  const { currentSphereId } = usePalimpsestContext()
  const resolvedSphere = sphere ?? currentSphereId
  const command = resolvedSphere !== undefined ? { kind: 'dashboard' as const, sphere: resolvedSphere } : undefined
  const raw = useRunQuery(command)

  if (resolvedSphere === undefined) return toPaginated<TaskJson>(undefined, 'tasks')

  return toPaginated<TaskJson>(raw, 'tasks')
}
