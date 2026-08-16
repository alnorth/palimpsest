import type { AgendaId, PalimpsestStore, ProjectionState } from '@alnorth/palimpsest'
import { CLEAR, updateProject } from '@alnorth/palimpsest'
import { requireProject } from './internal/requireProject'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export interface SetProjectAgendaArgs {
  projectId: string
  agendaId?: string | null
  selfOnly?: boolean
}

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runSetProjectAgenda(store: PalimpsestStore, projState: ProjectionState, args: SetProjectAgendaArgs): Promise<void> {
  if (args.agendaId !== undefined && args.agendaId !== null && args.selfOnly === true) {
    throw new Error('Cannot set both agendaId and selfOnly=true in the same call')
  }
  const project = requireProject(projState, args.projectId)
  await store.appendEvents(updateProject(project, {
    ...(args.agendaId !== undefined && { agendaId: args.agendaId === null ? CLEAR : args.agendaId as AgendaId }),
    ...(args.selfOnly !== undefined && { isSelfOnly: args.selfOnly }),
  }))
}

export function useSetProjectAgenda(): MutationResult<SetProjectAgendaArgs, void> {
  return useMutation(runSetProjectAgenda)
}
