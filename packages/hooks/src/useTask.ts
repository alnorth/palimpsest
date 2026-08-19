import type { TaskJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'

export function useTask(id: string): TaskJson {
  const raw = useRunQuery({ kind: 'task', id })
  return raw?.task as TaskJson
}
