import type { AgendaId, ContextId, ProjectId, SphereId, WaitingFor } from '@alnorth/palimpsest'
import { computeLabels } from './labels'
import { projectlessContainerFor, todoistProjectUrl } from './mapping'

export interface TodoistShapeFields {
  title: string
  description: string
  isNext?: true | undefined
  agendaId?: AgendaId | undefined
  contextId?: ContextId | undefined
  waitingFor?: WaitingFor | undefined
  isStarred?: true | undefined
  dueDate?: string | undefined
  dueDateExpression?: string | undefined
  projectId?: ProjectId | undefined
  // Caller resolves this with getTaskSphereId semantics before calling — see write.ts.
  sphereId?: SphereId | undefined
}

export interface TodoistShape {
  content: string
  description: string
  labels: string[]
  priority: 1 | 4
  due: { date?: string; string?: string } | undefined
  containerProjectId: string
}

// Pure derivation of a task's Todoist-facing representation from a flat snapshot of its
// palimpsest fields. Called once against a task's pre-patch fields and once against its
// resolved post-patch fields so write.ts's task.updated case can diff the two shapes instead of
// tracking which patch fields should trigger which recompute.
export function deriveTodoistShape(f: TodoistShapeFields): TodoistShape {
  const description =
    f.waitingFor?.kind === 'project' ? todoistProjectUrl(f.waitingFor.projectId) :
    f.waitingFor?.kind === 'trello'  ? f.waitingFor.cardUrl :
    f.description

  const labels = computeLabels({
    isNext: f.isNext, agendaId: f.agendaId, contextId: f.contextId, waitingFor: f.waitingFor,
  })

  const priority = f.isStarred === true ? 4 : 1

  const due =
    f.dueDateExpression !== undefined ? { string: f.dueDateExpression, ...(f.dueDate !== undefined && { date: f.dueDate }) } :
    f.dueDate !== undefined ? { date: f.dueDate } :
    undefined

  const containerProjectId = f.projectId !== undefined
    ? String(f.projectId)
    : projectlessContainerFor(f.sphereId, f.agendaId, {
        ...(f.dueDate !== undefined && { dueDate: f.dueDate }),
        ...(f.dueDateExpression !== undefined && { dueDateExpression: f.dueDateExpression }),
      })

  return { content: f.title, description, labels, priority, due, containerProjectId }
}
