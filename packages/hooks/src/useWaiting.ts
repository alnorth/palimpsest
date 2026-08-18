import type { TaskJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'

export interface WaitingGroup {
  kind: 'review' | 'agenda' | 'project' | 'trello'
  tasks: TaskJson[]
}

export function useWaiting(sphere?: string): WaitingGroup[] {
  const raw = useRunQuery({
    kind: 'waiting',
    ...(sphere !== undefined && { sphere }),
  })
  return (raw?.groups ?? []) as WaitingGroup[]
}
