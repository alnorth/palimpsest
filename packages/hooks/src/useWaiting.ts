import type { TaskJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { QueryResult } from './types'

export interface WaitingGroup {
  kind: 'review' | 'agenda' | 'project' | 'trello'
  tasks: TaskJson[]
}

export function useWaiting(sphere?: string): QueryResult<WaitingGroup[]> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'waiting',
    ...(sphere !== undefined && { sphere }),
  })
  return {
    data: raw !== undefined ? raw.groups as WaitingGroup[] : undefined,
    isLoading,
    error,
  }
}
