import type { TaskJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { QueryResult } from './types'

export function useTask(id: string): QueryResult<TaskJson> {
  const { raw, isLoading, error } = useRunQuery({ kind: 'task', id })
  return {
    data: raw !== undefined ? raw.task as TaskJson : undefined,
    isLoading,
    error,
  }
}
