import type { PalimpsestEvent, ProjectionState, Task, TaskPatch } from '@alnorth/palimpsest'
import { CLEAR, getTaskSphereId } from '@alnorth/palimpsest'
import type { SyncCommand } from './api'
import { computeLabels } from './labels'
import { deriveTodoistShape } from './deriveTodoistShape'
import {
  TODOIST_INBOX_ID,
  projectlessContainerFor,
  sphereParentProjectFor,
  todoistProjectUrl,
} from './mapping'
import {
  AGENDA_PROJECT_MAP_TASK_TITLE,
  SELF_AGENDA_LABEL,
  labelForAgenda,
  serializeAgendaMapping,
} from './sharedStorage'

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

// The value a patched field will hold once `patch` is applied: the patch's own value if it
// touches the field (undefined if CLEARed), else the field's current value on the task.
function resolvePatchField<T>(current: T | undefined, patchValue: T | typeof CLEAR | undefined): T | undefined {
  return patchValue !== undefined ? (patchValue === CLEAR ? undefined : patchValue) : current
}

// The due date/expression a task will have once `patch` is applied — feeds both the after-patch
// TodoistShape (due arg + container bucket) in the task.updated case below.
function effectiveDueState(
  task: Pick<Task, 'dueDate' | 'dueDateExpression'>,
  patch: Pick<TaskPatch, 'dueDate' | 'dueDateExpression'>,
): { dueDate: string | undefined; dueDateExpression: string | undefined } {
  return {
    dueDate: resolvePatchField(task.dueDate, patch.dueDate),
    dueDateExpression: resolvePatchField(task.dueDateExpression, patch.dueDateExpression),
  }
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
export interface BuildCommandsContext {
  rawAgendaMapping: Record<string, string>
  agendaMapTaskId?: string
}

export interface BuildCommandsResult {
  commands: SyncCommand[]
  tempId?: string
  // Set only for a project.updated event whose patch touches agendaId and ctx is provided — lets
  // a caller processing a whole batch (TodoistStore's buildAllCommands) thread the mapping forward
  // to the next event, instead of every event in the same flush reading the same stale snapshot.
  agendaMappingAfter?: Record<string, string>
  agendaMapTaskTempId?: string
}

export function buildCommands(
  event: PalimpsestEvent,
  state: ProjectionState,
  ctx?: BuildCommandsContext,
): BuildCommandsResult {
  switch (event.type) {

    case 'task.created': {
      const sphereId = event.sphereId ?? (event.projectId !== undefined
        ? state.projects.get(event.projectId)?.sphereId
        : undefined)

      const todoistProjectId = event.projectId !== undefined
        ? String(event.projectId)
        : projectlessContainerFor(sphereId, event.agendaId, {
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

      // The sphere used to pick a project-less container never changes within one update: it's
      // inherited either from the task's current project (if any) or its own sphereId, and there's
      // no patch field that moves a task to a different sphere independent of its project — a
      // cleared project's sphere carries forward as the container's sphere context, same as today.
      const sphereId = getTaskSphereId(state, task)

      const before = deriveTodoistShape({
        title: task.title, description: task.description,
        isNext: task.isNext, agendaId: task.agendaId, contextId: task.contextId,
        waitingFor: task.waitingFor, isStarred: task.isStarred,
        dueDate: task.dueDate, dueDateExpression: task.dueDateExpression,
        projectId: task.projectId, sphereId,
      })

      const afterProjectId = resolvePatchField(task.projectId, patch.projectId)
      const afterAgendaId = resolvePatchField(task.agendaId, patch.agendaId)
      const { dueDate: afterDueDate, dueDateExpression: afterDueDateExpression } = effectiveDueState(task, patch)

      const after = deriveTodoistShape({
        title: patch.title ?? task.title,
        description: patch.description ?? task.description,
        isNext: patch.isNext !== undefined ? (patch.isNext === true ? true : undefined) : task.isNext,
        agendaId: afterAgendaId,
        contextId: resolvePatchField(task.contextId, patch.contextId),
        waitingFor: resolvePatchField(task.waitingFor, patch.waitingFor),
        isStarred: patch.isStarred !== undefined ? (patch.isStarred === true ? true : undefined) : task.isStarred,
        dueDate: afterDueDate, dueDateExpression: afterDueDateExpression,
        projectId: afterProjectId, sphereId,
      })

      const args: Record<string, unknown> = { id: String(event.taskId) }
      if (before.content     !== after.content)     args['content']     = after.content
      if (before.description !== after.description) args['description'] = after.description
      if (before.priority    !== after.priority)    args['priority']    = after.priority
      if (after.due !== undefined && JSON.stringify(before.due) !== JSON.stringify(after.due)) {
        args['due'] = after.due
      }

      // A project-less task living directly in its agenda's dedicated Todoist project (see
      // AGENDA_PROJECT_IDS) carries that agenda purely via project membership — it may never have
      // had the agenda label explicitly written to Todoist. computeLabels() (inside
      // deriveTodoistShape) always includes the label whenever agendaId is set, so before.labels
      // and after.labels can come out equal even though the real Todoist item's label array is
      // missing it. Moving such a task onto/between real projects is the one moment that implicit
      // signal would be lost, so force a resend then, even though the diff alone sees no change.
      const forceLabelResync =
        patch.projectId !== undefined && patch.projectId !== CLEAR &&
        before.containerProjectId !== after.containerProjectId &&
        (task.agendaId !== undefined || afterAgendaId !== undefined)
      if (forceLabelResync || JSON.stringify(before.labels) !== JSON.stringify(after.labels)) {
        args['labels'] = after.labels
      }

      const commands: SyncCommand[] = []
      if (Object.keys(args).length > 1) {
        commands.push({ type: 'item_update', uuid: uuid(), args })
      }

      // One comparison replaces the old two separate branches (moving onto a real project vs.
      // recomputing the project-less container): containerProjectId already encodes "real project
      // id if set, else the project-less bucket" (agenda project takes priority, else the
      // due-date-bucketed free-floating container), so any transition between real/real,
      // real/project-less, or project-less/project-less is just "did this value change."
      if (before.containerProjectId !== after.containerProjectId) {
        commands.push({
          type: 'item_move',
          uuid: uuid(),
          args: { id: String(event.taskId), project_id: after.containerProjectId },
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

      const commands: SyncCommand[] = []
      if (Object.keys(args).length > 1) {
        commands.push({ type: 'project_update', uuid: uuid(), args })
      }

      // Todoist projects have no native field for a custom agenda link, so it round-trips through
      // a shared JSON-blob storage task instead (same mechanism/task the dashboard app already
      // uses) — read-modify-write one entry in the current mapping, preserving every other
      // project's entry untouched. isSelfOnly shares the same one mapping entry (SELF_AGENDA_LABEL
      // instead of an agenda label), so either field touches this block.
      if ((patch.agendaId !== undefined || patch.isSelfOnly !== undefined) && ctx !== undefined) {
        const newMapping = { ...ctx.rawAgendaMapping }
        const key = String(event.projectId)
        // isSelfOnly checked first: core's mutual-exclusivity guard (updateProject) prevents both
        // being positively true in a hand-authored patch, but buildDeltaEvents's unconditional
        // per-project rebuild routinely sends both agendaId: CLEAR and isSelfOnly: true/false
        // together — that's not contradictory ("make this self-only" already implies "no agenda"),
        // so isSelfOnly wins whenever both fields are present.
        if (patch.isSelfOnly === true) newMapping[key] = SELF_AGENDA_LABEL
        else if (patch.agendaId !== undefined && patch.agendaId !== CLEAR) newMapping[key] = labelForAgenda(patch.agendaId)
        else if (patch.agendaId === CLEAR) delete newMapping[key]
        // isSelfOnly: false alone only clears the entry if it's currently the self label — it must
        // not clobber a real agenda label a different patch put there (e.g. an "un-mark self-only"
        // call on a project that's actually already linked to a real agenda, not self-only at all).
        else if (patch.isSelfOnly === false && newMapping[key] === SELF_AGENDA_LABEL) delete newMapping[key]

        if (JSON.stringify(newMapping) === JSON.stringify(ctx.rawAgendaMapping)) {
          return { commands, agendaMappingAfter: newMapping }
        }

        const description = serializeAgendaMapping(newMapping)

        let agendaMapTaskTempId: string | undefined
        if (ctx.agendaMapTaskId !== undefined) {
          commands.push({ type: 'item_update', uuid: uuid(), args: { id: ctx.agendaMapTaskId, description } })
        } else {
          agendaMapTaskTempId = uuid()
          commands.push({ type: 'item_add', uuid: uuid(), temp_id: agendaMapTaskTempId,
            args: { content: AGENDA_PROJECT_MAP_TASK_TITLE, project_id: TODOIST_INBOX_ID, description } })
        }

        return {
          commands,
          agendaMappingAfter: newMapping,
          ...(agendaMapTaskTempId !== undefined && { agendaMapTaskTempId }),
        }
      }

      return { commands }
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
