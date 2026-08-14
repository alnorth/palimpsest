import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { CLEAR } from '@alnorth/palimpsest'
import type { SyncCommand } from './api'
import { computeLabels } from './labels'
import {
  WORK_SPHERE_ID,
  freeFloatingProjectFor,
  sphereParentProjectFor,
  todoistProjectUrl,
} from './mapping'

// crypto.randomUUID() isn't implemented by Hermes (React Native's JS engine) even with
// react-native-get-random-values installed — that polyfill only covers the older
// crypto.getRandomValues(), not this newer, separate Web Crypto API method. Calling the missing
// method throws "undefined is not a function", and since this runs for every single Sync API
// command (item_add, item_close, ...), it broke every write in a bare RN app, every time, with
// no read-path equivalent to have already caught it (reads never call buildCommands/uuid() at
// all). Building an RFC4122 v4 UUID from crypto.getRandomValues() instead works in every
// environment that already needs that polyfill for nanoid (see cockpit's CLAUDE.md), without
// requiring a second one.
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
        : freeFloatingProjectFor(sphereId, {
            ...(event.dueDate           !== undefined && { dueDate:           event.dueDate }),
            ...(event.dueDateExpression !== undefined && { dueDateExpression: event.dueDateExpression }),
          })

      const labels = computeLabels(event)

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

      if (patch.title !== undefined) args['content'] = patch.title
      const hasStructuralDescription =
        task.waitingFor?.kind === 'trello' || task.waitingFor?.kind === 'project'
      if (patch.description !== undefined && !hasStructuralDescription) {
        args['description'] = patch.description
      }

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
        args['labels'] = computeLabels({ isNext: newIsNext, agendaId: newAgendaId, contextId: newContextId, waitingFor: newWaitingFor })
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

      const newExpression = patch.dueDateExpression !== undefined && patch.dueDateExpression !== CLEAR
        ? patch.dueDateExpression : undefined
      const newDate = patch.dueDate !== undefined && patch.dueDate !== CLEAR
        ? patch.dueDate : undefined
      // When only the date changes, carry the existing expression forward so
      // Todoist doesn't wipe it out. When both change, newExpression wins.
      const effectiveExpression = newExpression ?? (newDate !== undefined ? task.dueDateExpression : undefined)

      if (newExpression !== undefined || newDate !== undefined) {
        args['due'] = {
          ...(newDate          !== undefined && { date:   newDate }),
          ...(effectiveExpression !== undefined && { string: effectiveExpression }),
        }
      }

      const commands: SyncCommand[] = []

      if (Object.keys(args).length > 1) {
        commands.push({ type: 'item_update', uuid: uuid(), args })
      }

      // Moving to a different (real) project
      if (patch.projectId !== undefined && patch.projectId !== CLEAR) {
        commands.push({
          type: 'item_move',
          uuid: uuid(),
          args: { id: String(event.taskId), project_id: String(patch.projectId) },
        })
        return { commands }
      }

      // For free-floating tasks, keep the task in the correct container
      // (One-Offs / Future Log / Recurring) whenever due date state changes.
      if (task.projectId === undefined && (patch.dueDate !== undefined || patch.dueDateExpression !== undefined)) {
        const sphereId = task.sphereId ?? WORK_SPHERE_ID
        const newExpression = patch.dueDateExpression !== undefined
          ? (patch.dueDateExpression === CLEAR ? undefined : patch.dueDateExpression)
          : task.dueDateExpression
        const newDueDate = patch.dueDate !== undefined
          ? (patch.dueDate === CLEAR ? undefined : patch.dueDate)
          : task.dueDate
        const newContainer = freeFloatingProjectFor(sphereId, {
          ...(newExpression !== undefined && { dueDateExpression: newExpression }),
          ...(newDueDate    !== undefined && { dueDate:           newDueDate }),
        })
        commands.push({
          type: 'item_move',
          uuid: uuid(),
          args: { id: String(event.taskId), project_id: newContainer },
        })
      }

      return { commands }
    }

    case 'task.completed':
      return { commands: [{ type: 'item_close', uuid: uuid(), args: { id: String(event.taskId) } }] }

    case 'task.uncompleted':
      return { commands: [{ type: 'item_uncomplete', uuid: uuid(), args: { id: String(event.taskId) } }] }

    case 'task.recurred': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) throw new Error(`task.recurred: task ${event.taskId} not found in state`)
      const due: Record<string, string> = { date: event.newDueDate }
      if (task.dueDateExpression !== undefined) due['string'] = task.dueDateExpression
      return { commands: [{
        type: 'item_update_date_complete',
        uuid: uuid(),
        args: { id: String(event.taskId), due, is_forward: 1 },
      }] }
    }

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
          args: {
            name: event.name,
            parent_id: parentId,
            ...(event.description !== undefined && { description: event.description }),
          },
        }],
      }
    }

    case 'project.updated': {
      const patch = event.patch
      const args: Record<string, unknown> = { id: String(event.projectId) }
      if (patch.name !== undefined) args['name'] = patch.name
      if (patch.description !== undefined) args['description'] = patch.description === CLEAR ? '' : patch.description

      if (Object.keys(args).length === 1) return { commands: [] }
      return { commands: [{ type: 'project_update', uuid: uuid(), args }] }
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
