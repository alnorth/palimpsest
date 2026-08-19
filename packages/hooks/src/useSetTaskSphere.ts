import type { PalimpsestStore, ProjectionState, SphereId } from '@alnorth/palimpsest'
import { updateTask } from '@alnorth/palimpsest'
import { requireTask } from './internal/requireTask'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export interface SetTaskSphereArgs {
  taskId: string
  sphereId: string
}

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runSetTaskSphere(store: PalimpsestStore, projState: ProjectionState, args: SetTaskSphereArgs): Promise<void> {
  const task = requireTask(projState, args.taskId)
  await store.appendEvents(updateTask(task, { sphereId: args.sphereId as SphereId }))
}

export function useSetTaskSphere(): MutationResult<SetTaskSphereArgs, void> {
  return useMutation(runSetTaskSphere)
}
