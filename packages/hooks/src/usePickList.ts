import type { TaskJson, EntityRef } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useRunQuery } from './internal/useRunQuery'
import type { QueryResult } from './types'

export interface PickListGroup {
  context: EntityRef
  tasks: TaskJson[]
}

export function usePickList(sphere?: string): QueryResult<PickListGroup[]> {
  const { currentSphereId } = usePalimpsestContext()
  const resolvedSphere = sphere ?? currentSphereId
  const command = resolvedSphere !== undefined ? { kind: 'pick_list' as const, sphere: resolvedSphere } : undefined
  const { raw, isLoading, error } = useRunQuery(command)

  if (resolvedSphere === undefined) {
    return { data: [], isLoading: false, error: undefined }
  }

  return {
    data: raw !== undefined ? raw.groups as PickListGroup[] : undefined,
    isLoading,
    error,
  }
}
