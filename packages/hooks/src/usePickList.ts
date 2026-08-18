import type { TaskJson, EntityRef } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useRunQuery } from './internal/useRunQuery'

export interface PickListGroup {
  context: EntityRef
  tasks: TaskJson[]
}

export function usePickList(sphere?: string): PickListGroup[] {
  const { currentSphereId } = usePalimpsestContext()
  const resolvedSphere = sphere ?? currentSphereId
  const command = resolvedSphere !== undefined ? { kind: 'pick_list' as const, sphere: resolvedSphere } : undefined
  const raw = useRunQuery(command)

  if (resolvedSphere === undefined) return []

  return raw?.groups as PickListGroup[]
}
