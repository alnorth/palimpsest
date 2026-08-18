import type { ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'

export function useProject(id: string): ProjectJson {
  const raw = useRunQuery({ kind: 'project', id })
  return raw?.project as ProjectJson
}
