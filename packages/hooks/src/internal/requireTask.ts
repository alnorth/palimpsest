import type { ProjectionState, Task, TaskId } from '@alnorth/palimpsest'
import { getTask } from '@alnorth/palimpsest'

export function requireTask(projState: ProjectionState, taskId: string): Task {
  const task = getTask(projState, taskId as TaskId)
  if (task === undefined) throw new Error(`Task not found: ${taskId}`)
  return task
}
