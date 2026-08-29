import type { PalimpsestEvent, ProjectionState, SphereId, Task, TaskPatch } from '@alnorth/palimpsest'
import { CLEAR, getTaskSphereId } from '@alnorth/palimpsest'
import type { SyncCommand } from './api'
import { deriveTodoistShape } from './deriveTodoistShape'
import type { TodoistShapeFields } from './deriveTodoistShape'
import {
  TODOIST_INBOX_ID,
  sphereParentProjectFor,
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

// Same idea as resolvePatchField, specialised for isNext/isStarred: these patch as a plain
// boolean (not CLEAR-able), and deriveTodoistShape only ever checks `=== true`, so `false`
// collapses to `undefined` just like the task's own field would when unset.
function resolveFlagField(current: true | undefined, patchValue: boolean | undefined): true | undefined {
  return patchValue !== undefined ? (patchValue === true ? true : undefined) : current
}

// The TodoistShapeFields a task's current (pre-patch) state maps to.
function currentShapeFields(task: Task, sphereId: SphereId | undefined): TodoistShapeFields {
  return {
    title: task.title, description: task.description,
    isNext: task.isNext, agendaId: task.agendaId, contextId: task.contextId,
    waitingFor: task.waitingFor, isStarred: task.isStarred,
    dueDate: task.dueDate, dueDateExpression: task.dueDateExpression,
    projectId: task.projectId, sphereId,
  }
}

// The TodoistShapeFields `fields` will hold once `patch` is applied — feeds both `before` (called
// with a task's own currentShapeFields) and `after` (called with the result of this function) so
// write.ts's task.updated case diffs two TodoistShapes instead of tracking which patch fields
// should trigger which recompute. sphereId is deliberately left untouched here: whether the
// patched sphereId actually applies depends on whether the task is (or becomes) project-less, a
// call the task.updated case below makes once, not per-field.
function applyPatchToFields(fields: TodoistShapeFields, patch: TaskPatch): TodoistShapeFields {
  return {
    title: patch.title ?? fields.title,
    description: patch.description ?? fields.description,
    isNext: resolveFlagField(fields.isNext, patch.isNext),
    agendaId: resolvePatchField(fields.agendaId, patch.agendaId),
    contextId: resolvePatchField(fields.contextId, patch.contextId),
    waitingFor: resolvePatchField(fields.waitingFor, patch.waitingFor),
    isStarred: resolveFlagField(fields.isStarred, patch.isStarred),
    dueDate: resolvePatchField(fields.dueDate, patch.dueDate),
    dueDateExpression: resolvePatchField(fields.dueDateExpression, patch.dueDateExpression),
    projectId: resolvePatchField(fields.projectId, patch.projectId),
    sphereId: fields.sphereId,
  }
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

      // Reuses the exact same field→Todoist-value derivation task.updated diffs against below,
      // so creating a task and immediately updating it (a no-op patch) can never produce a
      // different Todoist representation for the same palimpsest fields.
      const shape = deriveTodoistShape({
        title: event.title, description: event.description,
        isNext: event.isNext, agendaId: event.agendaId, contextId: event.contextId,
        waitingFor: event.waitingFor, isStarred: event.isStarred,
        dueDate: event.dueDate, dueDateExpression: event.dueDateExpression,
        projectId: event.projectId, sphereId,
      })

      const tempId = uuid()
      return {
        tempId,
        commands: [{
          type: 'item_add',
          uuid: uuid(),
          temp_id: tempId,
          args: {
            content: shape.content,
            project_id: shape.containerProjectId,
            labels: shape.labels,
            priority: shape.priority,
            ...(shape.description !== '' && { description: shape.description }),
            ...(shape.due !== undefined && { due: shape.due }),
          },
        }],
      }
    }

    case 'task.updated': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) return { commands: [] }

      const patch = event.patch

      // The pre-patch sphere: inherited from the task's current project if it has one, else its
      // own direct sphereId (getTaskSphereId semantics) — what a project-less container's
      // sphere-specific buckets (One-Offs, currently the only sphere-split bucket) resolve
      // against.
      const beforeSphereId = getTaskSphereId(state, task)
      const beforeFields = currentShapeFields(task, beforeSphereId)
      const before = deriveTodoistShape(beforeFields)

      const afterFields = applyPatchToFields(beforeFields, patch)
      // TaskPatch.sphereId only ever matters once the task is (or becomes) project-less —
      // deriveTodoistShape never consults sphereId when projectId is set — but it's a real,
      // independent way to move a project-less task to a different sphere's container, so it
      // can't just be carried forward unconditionally from the pre-patch task the way the old
      // code did. A patched sphereId wins; otherwise the pre-patch effective sphere carries
      // forward (e.g. when a project is cleared, its own sphere becomes the container's context).
      afterFields.sphereId = resolvePatchField(beforeSphereId, patch.sphereId)
      const after = deriveTodoistShape(afterFields)

      const args: Record<string, unknown> = { id: String(event.taskId) }
      if (before.content     !== after.content)     args['content']     = after.content
      if (before.description !== after.description) args['description'] = after.description
      if (before.priority    !== after.priority)    args['priority']    = after.priority
      if (JSON.stringify(before.due) !== JSON.stringify(after.due)) {
        // Todoist clears a due date when `due` is sent as null — omitting the key entirely (the
        // old behaviour here) leaves whatever due date Todoist already has untouched.
        args['due'] = after.due ?? null
      }

      // A project-less task living directly in its agenda's dedicated Todoist project (see
      // AGENDA_PROJECT_IDS) carries that agenda purely via project membership — it may never have
      // had the agenda label explicitly written to Todoist. computeLabels() (inside
      // deriveTodoistShape) always includes the label whenever agendaId is set, so before.labels
      // and after.labels can come out equal even though the real Todoist item's label array is
      // missing it. The container can only change into/between real projects when this patch
      // itself sets projectId (see deriveTodoistShape: containerProjectId ignores every other
      // field once projectId is set, so it can't have moved any other way) — that's the one
      // moment the implicit signal would be lost, so force a resend then, even though the diff
      // alone sees no change.
      const forceLabelResync =
        afterFields.projectId !== undefined &&
        before.containerProjectId !== after.containerProjectId &&
        (beforeFields.agendaId !== undefined || afterFields.agendaId !== undefined)
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
