import type { TaskId } from '@alnorth/palimpsest'
import { completeTask, getTask } from '@alnorth/palimpsest'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export function useCompleteTask(): MutationResult<string, void> {
  return useMutation(async (store, projState, taskId: string) => {
    const task = getTask(projState, taskId as TaskId)
    if (task === undefined) throw new Error(`Task not found: ${taskId}`)
    await store.appendEvents(completeTask(task))
  })
}
