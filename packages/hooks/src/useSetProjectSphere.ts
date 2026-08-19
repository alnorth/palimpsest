import type { PalimpsestStore, ProjectionState, SphereId } from '@alnorth/palimpsest'
import { updateProject } from '@alnorth/palimpsest'
import { requireProject } from './internal/requireProject'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export interface SetProjectSphereArgs {
  projectId: string
  sphereId: string
}

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runSetProjectSphere(store: PalimpsestStore, projState: ProjectionState, args: SetProjectSphereArgs): Promise<void> {
  const project = requireProject(projState, args.projectId)
  await store.appendEvents(updateProject(project, { sphereId: args.sphereId as SphereId }))
}

export function useSetProjectSphere(): MutationResult<SetProjectSphereArgs, void> {
  return useMutation(runSetProjectSphere)
}
