import type { AgendaJson, TaskJson, ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'

export interface AgendaViewData {
  agenda: AgendaJson
  waitingTasks: TaskJson[]
  activeTasks: TaskJson[]
  projects: ProjectJson[]
}

// `sphere` disambiguates an agenda name that collides across spheres — a case that shouldn't
// arise by design (agenda titles are meant to be globally unique, per the Todoist label mapping's
// flat account-wide namespace) but isn't actually enforced anywhere yet. Revisit whether this
// param is still needed once that uniqueness is validated (see alnorth/palimpsest#93).
export function useAgenda(agenda: string, sphere?: string): AgendaViewData {
  const raw = useRunQuery({
    kind: 'agenda_view',
    agenda,
    ...(sphere !== undefined && { sphere }),
  })
  return raw as unknown as AgendaViewData
}
