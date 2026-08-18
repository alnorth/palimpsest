import type { AgendaJson, TaskJson, ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { QueryResult } from './types'

export interface AgendaViewData {
  agenda: AgendaJson
  waitingTasks: TaskJson[]
  activeTasks: TaskJson[]
  projects: ProjectJson[]
}

export function useAgenda(agenda: string, sphere?: string): QueryResult<AgendaViewData> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'agenda_view',
    agenda,
    ...(sphere !== undefined && { sphere }),
  })
  return {
    data: raw !== undefined ? raw as unknown as AgendaViewData : undefined,
    isLoading,
    error,
  }
}
