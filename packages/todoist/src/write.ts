import type { PalimpsestEvent, ProjectionState } from 'palimpsest'
import { CLEAR } from 'palimpsest'
import type { SyncCommand } from './api.js'
import { computeLabels } from './labels.js'
import {
  WORK_SPHERE_ID,
  oneOffsProjectFor,
  sphereParentProjectFor,
  todoistProjectUrl,
} from './mapping.js'

function uuid(): string {
  return crypto.randomUUID()
}

// Build the due date args for a Sync API item_add / item_update command.
function dueDateArgs(
  dueString: string | undefined,
  dueDate: string | undefined,
): Record<string, unknown> {
  if (dueString !== undefined) return { due: { string: dueString } }
  if (dueDate   !== undefined) return { due: { date: dueDate } }
  return {}
}

// Convert a palimpsest event into the Sync API commands needed to apply it.
// Returns the array of commands plus the temp_id used for creation events (so
// the caller can read the Todoist-assigned ID back from temp_id_mapping).
export function buildCommands(
  event: PalimpsestEvent,
  state: ProjectionState,
): { commands: SyncCommand[]; tempId?: string } {
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

      const description =
        event.waitingFor?.kind === 'project' ? todoistProjectUrl(event.waitingFor.projectId) :
        event.waitingFor?.kind === 'trello'  ? event.waitingFor.cardUrl :
        event.description !== ''             ? event.description : undefined

      const priority = event.isStarred === true ? 4 : 1

      const tempId = uuid()
      return {
        tempId,
        commands: [{
          type: 'item_add',
          uuid: uuid(),
          temp_id: tempId,
          args: {
            content: event.title,
            project_id: todoistProjectId,
            labels,
            priority,
            ...(description !== undefined && { description }),
            ...dueDateArgs(event.dueDateExpression, event.dueDate),
          },
        }],
      }
    }

    case 'task.updated': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) return { commands: [] }

      const patch = event.patch
      const args: Record<string, unknown> = { id: String(event.taskId) }

      if (patch.title       !== undefined) args['content']     = patch.title
      if (patch.description !== undefined) args['description'] = patch.description

      if (
        patch.isNext     !== undefined ||
        patch.agendaId   !== undefined ||
        patch.contextId  !== undefined ||
        patch.waitingFor !== undefined
      ) {
        const newAgendaId   = patch.agendaId   !== undefined ? (patch.agendaId   === CLEAR ? undefined : patch.agendaId)   : task.agendaId
        const newContextId  = patch.contextId  !== undefined ? (patch.contextId  === CLEAR ? undefined : patch.contextId)  : task.contextId
        const newIsNext     = patch.isNext     !== undefined ? (patch.isNext     === false  ? undefined : true)             : task.isNext
        const newWaitingFor = patch.waitingFor !== undefined ? (patch.waitingFor === CLEAR ? undefined : patch.waitingFor) : task.waitingFor
        args['labels'] = computeLabels({
          ...(newIsNext     === true      && { isNext:     true }),
          ...(newAgendaId   !== undefined && { agendaId:   newAgendaId }),
          ...(newContextId  !== undefined && { contextId:  newContextId }),
          ...(newWaitingFor !== undefined && { waitingFor: newWaitingFor }),
        })
      }

      if (patch.isStarred !== undefined) {
        args['priority'] = patch.isStarred === true ? 4 : 1
      }

      if (patch.waitingFor !== undefined) {
        if (patch.waitingFor !== CLEAR && patch.waitingFor.kind === 'project') {
          args['description'] = todoistProjectUrl(patch.waitingFor.projectId)
        } else if (patch.waitingFor !== CLEAR && patch.waitingFor.kind === 'trello') {
          args['description'] = patch.waitingFor.cardUrl
        } else if (patch.description === undefined) {
          args['description'] = task.description
        }
      }

      if (patch.dueDate !== undefined && patch.dueDate !== CLEAR) {
        args['due'] = { date: patch.dueDate }
      }
      if (patch.dueDateExpression !== undefined && patch.dueDateExpression !== CLEAR) {
        args['due'] = { string: patch.dueDateExpression }
      }

      // Moving to a different project
      if (patch.projectId !== undefined && patch.projectId !== CLEAR) {
        const commands: SyncCommand[] = []
        if (Object.keys(args).length > 1) {
          commands.push({ type: 'item_update', uuid: uuid(), args })
        }
        commands.push({
          type: 'item_move',
          uuid: uuid(),
          args: { id: String(event.taskId), project_id: String(patch.projectId) },
        })
        return { commands }
      }

      if (Object.keys(args).length > 1) {
        return { commands: [{ type: 'item_update', uuid: uuid(), args }] }
      }
      return { commands: [] }
    }

    case 'task.completed':
      return { commands: [{ type: 'item_close', uuid: uuid(), args: { id: String(event.taskId) } }] }

    case 'task.uncompleted':
      return { commands: [{ type: 'item_uncomplete', uuid: uuid(), args: { id: String(event.taskId) } }] }

    case 'task.recurred':
      return { commands: [{
        type: 'item_update',
        uuid: uuid(),
        args: { id: String(event.taskId), due: { date: event.newDueDate } },
      }] }

    case 'task.deleted':
      return { commands: [{ type: 'item_delete', uuid: uuid(), args: { id: String(event.taskId) } }] }

    case 'project.created': {
      const parentId = sphereParentProjectFor(event.sphereId)
      const tempId = uuid()
      return {
        tempId,
        commands: [{
          type: 'project_add',
          uuid: uuid(),
          temp_id: tempId,
          args: { name: event.name, parent_id: parentId },
        }],
      }
    }

    case 'project.updated': {
      const patch = event.patch
      if (patch.name !== undefined) {
        return { commands: [{
          type: 'project_update',
          uuid: uuid(),
          args: { id: String(event.projectId), name: patch.name },
        }] }
      }
      return { commands: [] }
    }

    case 'project.archived':
      return { commands: [{
        type: 'project_archive',
        uuid: uuid(),
        args: { id: String(event.projectId) },
      }] }

    case 'project.unarchived':
      return { commands: [{
        type: 'project_unarchive',
        uuid: uuid(),
        args: { id: String(event.projectId) },
      }] }
  }
}
