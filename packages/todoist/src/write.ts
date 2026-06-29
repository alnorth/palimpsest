import type { PalimpsestEvent, ProjectionState, Task, TaskId, ProjectId } from 'palimpsest'
import { CLEAR } from 'palimpsest'
import { addTask, updateTask, closeTask, reopenTask, deleteTask, addProject, updateProject } from './api.js'
import { computeLabels } from './labels.js'
import {
  WORK_SPHERE_ID,
  oneOffsProjectFor,
  sphereParentProjectFor,
  todoistProjectUrl,
} from './mapping.js'

// Returns the Todoist-assigned ID when an entity is created, so the caller
// can substitute it for the palimpsest-generated nanoid in the event.
export async function applyEventToTodoist(
  event: PalimpsestEvent,
  state: ProjectionState,
  token: string,
): Promise<string | undefined> {
  switch (event.type) {

    case 'task.created': {
      const sphereId = event.sphereId ?? (event.projectId !== undefined
        ? (state.projects.get(event.projectId)?.sphereId ?? WORK_SPHERE_ID)
        : WORK_SPHERE_ID)

      const todoistProjectId = event.projectId !== undefined
        ? String(event.projectId)
        : oneOffsProjectFor(sphereId)

      const labels = computeLabels({
        ...(event.isNext     === true      && { isNext:     true }),
        ...(event.agendaId   !== undefined && { agendaId:   event.agendaId }),
        ...(event.contextId  !== undefined && { contextId:  event.contextId }),
        ...(event.waitingFor !== undefined && { waitingFor: event.waitingFor }),
      })

      // waitingFor.project: encode the linked project as a URL in the description
      const description = event.waitingFor?.kind === 'project'
        ? todoistProjectUrl(event.waitingFor.projectId)
        : (event.description !== '' ? event.description : undefined)

      const priority = event.isStarred === true ? 4 : 1

      const created = await addTask(token, {
        content:   event.title,
        projectId: todoistProjectId,
        labels,
        priority,
        ...(description !== undefined && { description }),
        ...(event.dueDateExpression !== undefined
          ? { dueString: event.dueDateExpression }
          : event.dueDate !== undefined
          ? { dueDate: event.dueDate }
          : {}),
      })

      return created.id
    }

    case 'task.updated': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) return undefined

      const patch = event.patch
      const updateArgs: Parameters<typeof updateTask>[2] = {}

      if (patch.title       !== undefined) updateArgs.content     = patch.title
      if (patch.description !== undefined) updateArgs.description = patch.description

      // Recompute the full label set from the post-patch task state
      if (
        patch.isNext      !== undefined ||
        patch.agendaId    !== undefined ||
        patch.contextId   !== undefined ||
        patch.waitingFor  !== undefined
      ) {
        const newAgendaId   = patch.agendaId   !== undefined ? (patch.agendaId   === CLEAR ? undefined : patch.agendaId)   : task.agendaId
        const newContextId  = patch.contextId  !== undefined ? (patch.contextId  === CLEAR ? undefined : patch.contextId)  : task.contextId
        const newIsNext     = patch.isNext     !== undefined ? (patch.isNext     === false  ? undefined : true)             : task.isNext
        const newWaitingFor = patch.waitingFor !== undefined ? (patch.waitingFor === CLEAR ? undefined : patch.waitingFor) : task.waitingFor
        updateArgs.labels = computeLabels({
          ...(newIsNext     === true      && { isNext:     true }),
          ...(newAgendaId   !== undefined && { agendaId:   newAgendaId }),
          ...(newContextId  !== undefined && { contextId:  newContextId }),
          ...(newWaitingFor !== undefined && { waitingFor: newWaitingFor }),
        })
      }

      if (patch.isStarred !== undefined) {
        updateArgs.priority = patch.isStarred === true ? 4 : 1
      }

      // waitingFor.project encodes its link in the description
      if (patch.waitingFor !== undefined) {
        if (patch.waitingFor !== CLEAR && patch.waitingFor.kind === 'project') {
          updateArgs.description = todoistProjectUrl(patch.waitingFor.projectId)
        } else if (patch.description === undefined) {
          // Changed or cleared waitingFor away from project — restore the task's own description
          updateArgs.description = task.description
        }
      }

      if (patch.dueDate !== undefined && patch.dueDate !== CLEAR) {
        updateArgs.dueDate = patch.dueDate
      }
      if (patch.dueDateExpression !== undefined && patch.dueDateExpression !== CLEAR) {
        updateArgs.dueString = patch.dueDateExpression
      }

      // Moving a task between projects: Todoist REST v2 doesn't support projectId
      // in task updates. This case would need the Sync API; skip for now.

      if (Object.keys(updateArgs).length > 0) {
        await updateTask(token, String(event.taskId), updateArgs)
      }
      return undefined
    }

    case 'task.completed': {
      await closeTask(token, String(event.taskId))
      return undefined
    }

    case 'task.uncompleted': {
      await reopenTask(token, String(event.taskId))
      return undefined
    }

    case 'task.recurred': {
      // Advance the due date directly rather than closing (which would let Todoist
      // compute the next date — potentially different from what palimpsest computed).
      await updateTask(token, String(event.taskId), { dueDate: event.newDueDate })
      return undefined
    }

    case 'task.deleted': {
      await deleteTask(token, String(event.taskId))
      return undefined
    }

    case 'project.created': {
      const parentId = sphereParentProjectFor(event.sphereId)
      const created = await addProject(token, { name: event.name, parentId })
      return created.id
    }

    case 'project.updated': {
      const patch = event.patch
      if (patch.name !== undefined) {
        await updateProject(token, String(event.projectId), { name: patch.name })
      }
      // sphereId changes would require reparenting — not supported in REST v2
      return undefined
    }

    case 'project.archived':
    case 'project.unarchived':
      // Todoist REST v2 has no archive endpoint; apply to in-memory state only
      return undefined
  }
}

// Substitute the palimpsest-generated nanoid with the Todoist-assigned ID in a
// creation event, so the in-memory state uses stable Todoist IDs throughout.
export function substituteCreatedId(event: PalimpsestEvent, todoistId: string): PalimpsestEvent {
  if (event.type === 'task.created')    return { ...event, taskId:    todoistId as TaskId }
  if (event.type === 'project.created') return { ...event, projectId: todoistId as ProjectId }
  return event
}

// Apply any pending nanoid → todoistId substitutions to foreign-key fields
// within an event (e.g. the projectId on a task.created that refers to a
// project created earlier in the same batch).
export function applyIdSubstitutions(
  event: PalimpsestEvent,
  subs: Map<string, string>,
): PalimpsestEvent {
  if (event.type === 'task.created' && event.projectId !== undefined) {
    const sub = subs.get(event.projectId)
    if (sub !== undefined) return { ...event, projectId: sub as ProjectId }
  }
  if (
    event.type === 'task.updated' &&
    event.patch.projectId !== undefined &&
    event.patch.projectId !== CLEAR
  ) {
    const sub = subs.get(event.patch.projectId)
    if (sub !== undefined) return { ...event, patch: { ...event.patch, projectId: sub as ProjectId } }
  }
  return event
}
