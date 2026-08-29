import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCommands } from './write'
import type { SyncCommand } from './api'
import { createEmptyState } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState, TaskId, ProjectId, SphereId, AgendaId, ContextId, EventId, TaskPatch } from '@alnorth/palimpsest'
import { CLEAR } from '@alnorth/palimpsest'
import {
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
  TODOIST_INBOX_ID,
  AGENDA_ID_TO_AGENDA_PROJECT_ID,
  UNSPHERED_LABEL,
} from './mapping'
import { AGENDA_PROJECT_MAP_TASK_TITLE } from './sharedStorage'

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 0
function evId(): EventId { return `ev-${++seq}` as EventId }
function taskId(n = '1'): TaskId { return `task-${n}` as TaskId }
function projId(n = '1'): ProjectId { return `proj-${n}` as ProjectId }

const T1 = 'task-1' as TaskId
const EV_ID = 'ev1' as EventId

function baseState(): ProjectionState {
  return createEmptyState()
}

function stateWithProjects(projects: Array<{ id: ProjectId; sphereId: SphereId }> = []): ProjectionState {
  const state = createEmptyState()
  for (const p of projects) {
    state.projects.set(p.id, { id: p.id, sphereId: p.sphereId, name: 'X', createdAt: '', updatedAt: '' })
  }
  return state
}

// A single open, work-sphere, project-less, undated task at T1 — every task.updated case
// overrides just the fields its scenario needs; fields it never touches never surface in a
// case's expectedCommands, since those only assert on before/after diffs.
function stateWithTask(overrides: Record<string, unknown> = {}, projects: Array<{ id: ProjectId; sphereId: SphereId }> = []): ProjectionState {
  const state = createEmptyState()
  state.tasks.set(T1, {
    id: T1,
    title: 'Existing task',
    description: '',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sphereId: WORK_SPHERE_ID,
    ...overrides,
  } as any)
  for (const p of projects) {
    state.projects.set(p.id, { id: p.id, sphereId: p.sphereId, name: 'X', createdAt: '', updatedAt: '' })
  }
  return state
}

// Strips the random `uuid` (and, on a creation command, `temp_id`) so a whole command array can
// be compared with one toEqual — the two things buildCommands actually guarantees for a given
// input, `type` and `args`, are what these tests care about; the tempId mechanics themselves are
// checked separately, once, by the runners below.
function stripIds(commands: SyncCommand[]) {
  return commands.map(({ uuid: _uuid, temp_id: _tempId, ...rest }) => rest)
}

// ── task.created ──────────────────────────────────────────────────────────────

function defaultCreatedEvent(overrides: Record<string, unknown>): PalimpsestEvent {
  return {
    type: 'task.created',
    id: EV_ID,
    occurredAt: '2026-06-29T00:00:00Z',
    taskId: T1,
    title: 'Buy milk',
    description: '',
    sphereId: WORK_SPHERE_ID,
    ...overrides,
  } as PalimpsestEvent
}

interface CreatedCase {
  name: string
  event: Record<string, unknown>
  projects?: Array<{ id: ProjectId; sphereId: SphereId }>
  expectedCommands: Array<{ type: string; args: Record<string, unknown> }>
}

const CREATED_CASES: CreatedCase[] = [
  { name: 'defaults to work one-offs project for work-sphere task with no projectId',
    event: { sphereId: WORK_SPHERE_ID },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 1 } }] },

  { name: 'defaults to personal one-offs project for personal-sphere task',
    event: { sphereId: PERSONAL_SPHERE_ID },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_PERSONAL_ONEOFFS_ID, labels: [], priority: 1 } }] },

  { name: 'uses explicit projectId if provided',
    event: { projectId: 'myproj' as ProjectId, sphereId: undefined },
    projects: [{ id: 'myproj' as ProjectId, sphereId: WORK_SPHERE_ID }],
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: 'myproj', labels: [], priority: 1 } }] },

  // deriveTodoistShape only ever consults sphereId when projectId is undefined, so a projectId
  // always wins outright — event.sphereId (however it disagrees with the project's own sphere) is
  // never looked at, and no state.projects lookup is needed to arrive at that.
  { name: 'projectId set → container is the project itself, regardless of event.sphereId',
    event: { projectId: 'myproj' as ProjectId, sphereId: PERSONAL_SPHERE_ID },
    projects: [{ id: 'myproj' as ProjectId, sphereId: WORK_SPHERE_ID }],
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: 'myproj', labels: [], priority: 1 } }] },

  // A new project-less task with an agendaId belongs in that agenda's dedicated Todoist project,
  // mirroring how the read path infers the same agendaId from a task living there — not merely
  // labelled while sitting in whichever due-date-bucketed free-floating container.
  { name: "agendaId with no projectId → placed directly in the agenda's dedicated project, not One-Offs",
    event: { agendaId: 'agenda-jim' as AgendaId, sphereId: WORK_SPHERE_ID },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'], labels: [], priority: 1 } }] },

  { name: 'agendaId takes priority over due date state when choosing the container',
    event: { agendaId: 'agenda-jim' as AgendaId, sphereId: WORK_SPHERE_ID, dueDate: '2026-12-01' },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'], labels: [], priority: 1,
      due: { date: '2026-12-01' },
    } }] },

  { name: 'agendaId with no dedicated Todoist project falls back to the ordinary free-floating container',
    event: { agendaId: 'agenda-ghost' as AgendaId, sphereId: WORK_SPHERE_ID },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 1 } }] },

  // A task with no sphere and no project (e.g. a quick-captured Inbox task, never triaged into a
  // sphere) must stay in Inbox even once it gains a due date — Future Log/Recurring are reserved
  // for tasks with a sphere; guessing a sphere for placement purposes would move the task somewhere
  // the user hasn't actually filed it. Landing in Inbox this way also carries UNSPHERED_LABEL, so
  // the read path can tell it apart from a genuinely captured, never-triaged Inbox task.
  { name: 'no sphere + no projectId + dueDate → stays in Inbox, not Future Log',
    event: { dueDate: '2026-12-01', sphereId: undefined },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_INBOX_ID, labels: [UNSPHERED_LABEL], priority: 1,
      due: { date: '2026-12-01' },
    } }] },

  { name: 'no sphere + no projectId + dueDateExpression → stays in Inbox, not Recurring',
    event: { dueDateExpression: 'every monday', sphereId: undefined },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_INBOX_ID, labels: [UNSPHERED_LABEL], priority: 1,
      due: { string: 'every monday' },
    } }] },

  { name: 'isStarred → priority 4',
    event: { isStarred: true },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 4 } }] },

  { name: 'no isStarred → priority 1',
    event: {},
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 1 } }] },

  { name: 'isNext → next label',
    event: { isNext: true },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: ['next'], priority: 1 } }] },

  { name: 'agendaId with a real project → agenda label',
    event: { agendaId: 'agenda-jim' as AgendaId, projectId: 'proj2' as ProjectId },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: 'proj2', labels: ['jim'], priority: 1 } }] },

  // A project-less task created straight into its agenda's dedicated project (see the
  // AGENDA_PROJECT_IDS case above) carries the agenda purely via project membership — no label
  // needed, matching how the read path infers it back with no label present either.
  { name: "agendaId with no projectId (placed in the agenda's dedicated project) → no agenda label",
    event: { agendaId: 'agenda-jim' as AgendaId, sphereId: WORK_SPHERE_ID },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'], labels: [], priority: 1 } }] },

  { name: 'waitingFor project → waiting+project labels + project URL in description',
    event: { waitingFor: { kind: 'project', projectId: '6JJ9prC5CQMwjRP4' as ProjectId } },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: ['waiting', 'project'], priority: 1,
      description: 'https://todoist.com/app/project/6JJ9prC5CQMwjRP4',
    } }] },

  { name: 'waitingFor trello → waiting+trello labels + cardUrl in description',
    event: { waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: ['waiting', 'trello'], priority: 1,
      description: 'https://trello.com/c/abc',
    } }] },

  { name: 'user description included when no structural waitingFor',
    event: { description: 'some notes' },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 1, description: 'some notes',
    } }] },

  { name: 'empty description not included',
    event: { description: '' },
    expectedCommands: [{ type: 'item_add', args: { content: 'Buy milk', project_id: TODOIST_WORK_ONEOFFS_ID, labels: [], priority: 1 } }] },

  { name: 'dueDate included as due.date',
    event: { dueDate: '2026-07-01' },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_FUTURE_LOG_ID, labels: [], priority: 1, due: { date: '2026-07-01' },
    } }] },

  // Matches task.updated's own "both patched → sends both" behavior (see below) — task.created
  // derives its due args via the same deriveTodoistShape() task.updated diffs against, so the two
  // paths can't drift apart.
  { name: 'dueDateExpression and dueDate both set → sends both to anchor Todoist to the palimpsest date',
    event: { dueDateExpression: 'every monday', dueDate: '2026-07-07' },
    expectedCommands: [{ type: 'item_add', args: {
      content: 'Buy milk', project_id: TODOIST_RECURRING_ID, labels: [], priority: 1,
      due: { string: 'every monday', date: '2026-07-07' },
    } }] },
]

describe('buildCommands — task.created', () => {
  it.each(CREATED_CASES)('$name', ({ event, projects, expectedCommands }) => {
    const { commands, tempId } = buildCommands(defaultCreatedEvent(event), stateWithProjects(projects))
    // Every task.created call returns a tempId matching the one command it always produces —
    // checked here on every case instead of as three separate mechanical tests.
    expect(tempId).toBeDefined()
    expect(commands[0]?.temp_id).toBe(tempId)
    expect(stripIds(commands)).toEqual(expectedCommands)
  })
})

// ── task.updated ──────────────────────────────────────────────────────────────

interface UpdatedCase {
  name: string
  task?: Record<string, unknown>
  projects?: Array<{ id: ProjectId; sphereId: SphereId }>
  patch: TaskPatch
  noTaskInState?: boolean
  expectedCommands: Array<{ type: string; args: Record<string, unknown> }>
}

const UPDATED_CASES: UpdatedCase[] = [
  { name: 'returns empty commands when task not in state',
    noTaskInState: true,
    patch: { title: 'New title' },
    expectedCommands: [] },

  { name: 'title patch → content in item_update args',
    patch: { title: 'Updated' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, content: 'Updated' } }] },

  { name: 'isStarred true → priority 4',
    patch: { isStarred: true },
    expectedCommands: [{ type: 'item_update', args: { id: T1, priority: 4 } }] },

  { name: 'isStarred false → priority 1',
    task: { isStarred: true },
    patch: { isStarred: false },
    expectedCommands: [{ type: 'item_update', args: { id: T1, priority: 1 } }] },

  // The diff-based design only sends a command when the derived Todoist value actually changes —
  // patching isStarred: false onto a task that's already unstarred is a no-op, not a resend.
  { name: 'isStarred false on an already-unstarred task → no command (no-op, not a resend)',
    patch: { isStarred: false },
    expectedCommands: [] },

  { name: 'dueDate patch → due.date',
    patch: { dueDate: '2026-08-01' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { date: '2026-08-01' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_FUTURE_LOG_ID } },
    ] },

  { name: 'dueDate patch on recurring task → due preserves existing expression string',
    task: { dueDateExpression: 'every monday' },
    patch: { dueDate: '2026-08-01' },
    // Recurring already, and stays Recurring (dueDateExpression takes priority over the dueDate
    // bucket either way) — so only the due value changes, no container move.
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { date: '2026-08-01', string: 'every monday' } } },
    ] },

  { name: 'dueDateExpression patch → due.string',
    patch: { dueDateExpression: 'every monday' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { string: 'every monday' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_RECURRING_ID } },
    ] },

  { name: 'both dueDate and dueDateExpression patched → sends both to anchor Todoist to palimpsest date',
    patch: { dueDate: '2026-08-04', dueDateExpression: 'every monday' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { string: 'every monday', date: '2026-08-04' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_RECURRING_ID } },
    ] },

  { name: 'projectId patch → item_update + item_move',
    patch: { title: 'New', projectId: 'proj2' as ProjectId },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, content: 'New' } },
      { type: 'item_move', args: { id: T1, project_id: 'proj2' } },
    ] },

  { name: 'projectId-only patch → only item_move (no item_update with just id)',
    patch: { projectId: 'proj2' as ProjectId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: 'proj2' } }] },

  // A task living only in its agenda project (see AGENDA_PROJECT_IDS in mapping.ts) carries its
  // agendaId with no explicit Todoist label — the project membership alone conveys it. Moving that
  // task onto a real project (task now has both an agenda AND a project) must not silently drop
  // the agenda: the label has to be added explicitly, since the implicit "lives in the agenda
  // project" signal disappears the moment it leaves that project.
  { name: 'moving a task with an implicit agendaId onto a real project → item_move plus item_update carrying the agenda label',
    task: { agendaId: 'agenda-jim' as AgendaId },
    patch: { projectId: 'proj2' as ProjectId },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, labels: ['jim'] } },
      { type: 'item_move', args: { id: T1, project_id: 'proj2' } },
    ] },

  { name: 'moving a task with no agendaId onto a real project does not spuriously add labels',
    patch: { projectId: 'proj2' as ProjectId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: 'proj2' } }] },

  // Both projects are real, so the label was already genuinely written to Todoist both before and
  // after — nothing about its representation changed, so no redundant resend is needed.
  { name: 'a task already in a real project with an explicit agenda label moves to a different real project → label is not resent',
    task: { agendaId: 'agenda-jim' as AgendaId, projectId: 'proj2' as ProjectId },
    patch: { projectId: 'proj3' as ProjectId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: 'proj3' } }] },

  // The task's label was genuinely written to Todoist while it lived in a real project; moving
  // into the agenda project makes that label redundant (project membership alone now conveys the
  // agenda), so it's explicitly removed rather than left stale.
  { name: "clearing a task's project (CLEAR) while it has an agendaId moves it into that agenda's dedicated project, removing the now-redundant label",
    task: { agendaId: 'agenda-jim' as AgendaId, projectId: 'proj2' as ProjectId },
    patch: { projectId: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, labels: [] } },
      { type: 'item_move', args: { id: T1, project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'] } },
    ] },

  { name: "clearing a task's project (CLEAR) with no agendaId falls back to the due-date-appropriate free-floating container",
    task: { projectId: 'proj2' as ProjectId, dueDate: '2026-12-01' },
    projects: [{ id: 'proj2' as ProjectId, sphereId: WORK_SPHERE_ID }],
    patch: { projectId: CLEAR },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: TODOIST_FUTURE_LOG_ID } }] },

  // A project-less task with no sphere at all (e.g. living in Inbox, never triaged) must stay in
  // Inbox when it gains a due date, rather than guessing a sphere to bucket it into Future Log —
  // and lands there carrying UNSPHERED_LABEL, same as a brand-new task in this state.
  { name: 'adding a dueDate to a sphere-less project-less task keeps it in Inbox, not Future Log',
    task: { sphereId: undefined },
    patch: { dueDate: '2026-12-01' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { date: '2026-12-01' }, labels: [UNSPHERED_LABEL] } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_INBOX_ID } },
    ] },

  { name: 'adding a dueDateExpression to a sphere-less project-less task keeps it in Inbox, not Recurring',
    task: { sphereId: undefined },
    patch: { dueDateExpression: 'every monday' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { string: 'every monday' }, labels: [UNSPHERED_LABEL] } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_INBOX_ID } },
    ] },

  // TaskPatch.sphereId is a real, direct way to move a project-less task to a different sphere's
  // container, independent of any project change.
  { name: "patching sphereId on an undated project-less task moves it to the new sphere's One-Offs",
    task: { sphereId: WORK_SPHERE_ID },
    patch: { sphereId: PERSONAL_SPHERE_ID },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: TODOIST_PERSONAL_ONEOFFS_ID } }] },

  // A task bound to a real project never carries a direct sphereId (sphere is inherited via the
  // project — see core's getTaskSphereId); it's only project-less tasks that ever have task.sphereId
  // set. Falling back to `task.sphereId ?? WORK_SPHERE_ID` when clearing a project therefore always
  // picks the Work sphere for a task that was in a Personal-sphere project, since task.sphereId was
  // never set on it. The container choice must be derived from the project's own sphere instead.
  { name: "clearing a task's project (CLEAR) resolves the free-floating container by the project's (inherited) sphere, not task.sphereId",
    task: { projectId: 'proj-personal' as ProjectId, sphereId: undefined },
    projects: [{ id: 'proj-personal' as ProjectId, sphereId: PERSONAL_SPHERE_ID }],
    patch: { projectId: CLEAR },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: TODOIST_PERSONAL_ONEOFFS_ID } }] },

  // Setting an agendaId on a task that has no real project — the write-side mirror of the read
  // path's AGENDA_PROJECT_IDS fallback: the task itself moves into that agenda's dedicated
  // project, not merely a label added while it stays in its current free-floating container.
  // Moving into the agenda's dedicated project conveys the agenda purely via project membership —
  // no label is ever written, so there's nothing for an item_update to carry.
  { name: "setting agendaId on a project-less task moves it into that agenda's dedicated project, with no label needed",
    patch: { agendaId: 'agenda-jim' as AgendaId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'] } }] },

  // The task never had the label physically written (it lived in the agenda project instead), so
  // there's nothing to remove — no item_update, just the move.
  { name: 'clearing agendaId on a project-less task moves it out of the agenda project into the due-date-appropriate free-floating container, with no label to remove',
    task: { agendaId: 'agenda-jim' as AgendaId, dueDateExpression: 'every monday' },
    patch: { agendaId: CLEAR },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: TODOIST_RECURRING_ID } }] },

  { name: "changing agendaId on a project-less task moves it directly from one agenda's project to the other's",
    task: { agendaId: 'agenda-jim' as AgendaId },
    patch: { agendaId: 'agenda-marcia' as AgendaId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-marcia'] } }] },

  // The diff-based design only moves a task when its container actually changes — a task already
  // in its agenda's dedicated project stays there regardless of a due-date change (agenda takes
  // priority over due-date bucketing either way), so no item_move is sent (the old code re-sent a
  // same-container item_move here unconditionally whenever a due field was touched).
  { name: 'a due date change on a project-less task with an agendaId keeps it in the agenda project → no item_move (container unchanged)',
    task: { agendaId: 'agenda-jim' as AgendaId },
    patch: { dueDate: '2026-12-01' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, due: { date: '2026-12-01' } } }] },

  { name: 'a combined agendaId + projectId patch → item_update carries the new agenda label alongside item_move',
    task: { agendaId: 'agenda-jim' as AgendaId },
    patch: { agendaId: 'agenda-marcia' as AgendaId, projectId: 'proj2' as ProjectId },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, labels: ['marcia'] } },
      { type: 'item_move', args: { id: T1, project_id: 'proj2' } },
    ] },

  // The task never had the label physically written (it lived in the agenda project instead), and
  // it has none after either (agendaId cleared) — nothing for an item_update to carry, just the move.
  { name: 'clearing agendaId while moving onto a real project → no label to send, item_move still happens',
    task: { agendaId: 'agenda-jim' as AgendaId },
    patch: { agendaId: CLEAR, projectId: 'proj2' as ProjectId },
    expectedCommands: [{ type: 'item_move', args: { id: T1, project_id: 'proj2' } }] },

  { name: 'patch with no content fields → no item_update command',
    patch: { dueDate: CLEAR },
    expectedCommands: [] },

  { name: 'isNext patch → labels recomputed',
    patch: { isNext: true },
    expectedCommands: [{ type: 'item_update', args: { id: T1, labels: ['next'] } }] },

  { name: 'contextId patch → labels recomputed with the new context label',
    patch: { contextId: 'ctx-quick' as ContextId },
    expectedCommands: [{ type: 'item_update', args: { id: T1, labels: ['quick'] } }] },

  { name: 'clearing contextId → context label removed',
    task: { contextId: 'ctx-quick' as ContextId },
    patch: { contextId: CLEAR },
    expectedCommands: [{ type: 'item_update', args: { id: T1, labels: [] } }] },

  { name: 'waitingFor patch → labels recomputed to include the waiting label',
    patch: { waitingFor: { kind: 'review' } },
    expectedCommands: [{ type: 'item_update', args: { id: T1, labels: ['waiting', 'nonagenda'] } }] },

  { name: 'clearing waitingFor (CLEAR) → waiting label removed',
    task: { waitingFor: { kind: 'review' } },
    patch: { waitingFor: CLEAR },
    expectedCommands: [{ type: 'item_update', args: { id: T1, labels: [] } }] },

  { name: 'description patch (no waitingFor involved) → item_update description',
    task: { description: 'old notes' },
    patch: { description: 'new notes' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, description: 'new notes' } }] },

  // Regression: clearing a structural waitingFor (project/trello) while supplying a new
  // description in the same patch must apply the new description — the old ad hoc code silently
  // dropped it in exactly this combination (a pre-patch "has structural description" guard raced
  // against a post-patch "only overwrite if patch.description is untouched" guard).
  { name: 'clearing a structural waitingFor while also setting a new description → new description applied',
    task: { waitingFor: { kind: 'project', projectId: 'proj2' as ProjectId }, description: '' },
    patch: { waitingFor: CLEAR, description: 'new notes' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, description: 'new notes', labels: [] } }] },

  // ── Free-floating container moves ─────────────────────────────────────────

  { name: 'adding dueDate to undated free-floating task → item_move to Future Log',
    patch: { dueDate: '2026-12-01' }, // no dueDate, no dueDateExpression → One-Offs before
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { date: '2026-12-01' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_FUTURE_LOG_ID } },
    ] },

  { name: 'adding dueDateExpression to undated free-floating task → item_move to Recurring',
    patch: { dueDateExpression: 'every monday' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { string: 'every monday' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_RECURRING_ID } },
    ] },

  { name: 'adding dueDateExpression to Future Log task → item_move to Recurring',
    task: { dueDate: '2026-12-01' }, // Future Log
    patch: { dueDateExpression: 'every monday' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { string: 'every monday', date: '2026-12-01' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_RECURRING_ID } },
    ] },

  { name: 'clearing dueDateExpression on Recurring task that has a dueDate → item_move to Future Log',
    task: { dueDate: '2026-12-01', dueDateExpression: 'every monday' },
    patch: { dueDateExpression: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: { date: '2026-12-01' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_FUTURE_LOG_ID } },
    ] },

  { name: 'clearing dueDate on Future Log task → item_move to One-Offs',
    task: { dueDate: '2026-12-01' },
    patch: { dueDate: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: null } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_WORK_ONEOFFS_ID } },
    ] },

  // Clearing a task's only due date/expression must remove it in Todoist too, not just move the
  // container.
  { name: 'clearing dueDate on a task that has one → item_update sends due: null',
    task: { dueDate: '2026-12-01' },
    patch: { dueDate: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: null } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_WORK_ONEOFFS_ID } },
    ] },

  { name: 'clearing dueDateExpression on a task that has one (no dueDate) → item_update sends due: null',
    task: { dueDateExpression: 'every monday' },
    patch: { dueDateExpression: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: null } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_WORK_ONEOFFS_ID } },
    ] },

  { name: 'clearing dueDateExpression on Recurring task with no other dueDate → item_move to One-Offs',
    task: { dueDateExpression: 'every monday' },
    patch: { dueDateExpression: CLEAR },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, due: null } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_WORK_ONEOFFS_ID } },
    ] },

  // The diff-based design only moves a task when its *container* changes — a due-date value
  // change that stays within the same bucket (Future Log either way) is no longer a container
  // change, so no item_move is sent (the old code re-sent a same-container item_move here
  // unconditionally whenever dueDate was touched; that was always a no-op Sync API call).
  { name: 'changing dueDate within the same bucket (Future Log → Future Log) → no item_move',
    task: { dueDate: '2026-12-01' },
    patch: { dueDate: '2027-01-01' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, due: { date: '2027-01-01' } } }] },

  { name: 'container move + title change → both item_update and item_move',
    patch: { title: 'New title', dueDate: '2026-12-01' },
    expectedCommands: [
      { type: 'item_update', args: { id: T1, content: 'New title', due: { date: '2026-12-01' } } },
      { type: 'item_move', args: { id: T1, project_id: TODOIST_FUTURE_LOG_ID } },
    ] },

  { name: 'task with projectId does not get container move',
    task: { projectId: 'proj1' as ProjectId },
    patch: { dueDate: '2026-12-01' },
    expectedCommands: [{ type: 'item_update', args: { id: T1, due: { date: '2026-12-01' } } }] },
]

describe('buildCommands — task.updated', () => {
  it.each(UPDATED_CASES)('$name', ({ task, projects, patch, noTaskInState, expectedCommands }) => {
    const state = noTaskInState === true ? baseState() : stateWithTask(task, projects)
    const event: PalimpsestEvent = {
      type: 'task.updated', id: EV_ID, occurredAt: '2026-06-29T00:00:00Z', taskId: T1, patch,
    }
    const { commands } = buildCommands(event, state)
    expect(stripIds(commands)).toEqual(expectedCommands)
  })
})

// ── Other event types ─────────────────────────────────────────────────────────

interface LifecycleCase {
  name: string
  event: PalimpsestEvent
  state: ProjectionState
  expectedCommands: Array<{ type: string; args: Record<string, unknown> }>
}

const LIFECYCLE_CASES: LifecycleCase[] = [
  { name: 'task.completed → item_close',
    event: { type: 'task.completed', id: EV_ID, occurredAt: '', taskId: T1 },
    state: baseState(),
    expectedCommands: [{ type: 'item_close', args: { id: T1 } }] },

  { name: 'task.uncompleted → item_uncomplete',
    event: { type: 'task.uncompleted', id: EV_ID, occurredAt: '', taskId: T1 },
    state: baseState(),
    expectedCommands: [{ type: 'item_uncomplete', args: { id: T1 } }] },

  { name: 'task.recurred → item_update_date_complete with new due date',
    event: { type: 'task.recurred', id: EV_ID, occurredAt: '', taskId: T1, newDueDate: '2026-07-14' },
    state: stateWithTask({ dueDateExpression: 'every week' }),
    expectedCommands: [{
      type: 'item_update_date_complete',
      args: { id: T1, due: { date: '2026-07-14', string: 'every week' }, is_forward: 1 },
    }] },

  { name: 'task.deleted → item_delete',
    event: { type: 'task.deleted', id: EV_ID, occurredAt: '', taskId: T1 },
    state: baseState(),
    expectedCommands: [{ type: 'item_delete', args: { id: T1 } }] },
]

describe('buildCommands — task lifecycle', () => {
  it.each(LIFECYCLE_CASES)('$name', ({ event, state, expectedCommands }) => {
    const { commands } = buildCommands(event, state)
    expect(stripIds(commands)).toEqual(expectedCommands)
  })

  it('task.recurred → throws if task not in state', () => {
    expect(() => buildCommands(
      { type: 'task.recurred', id: evId(), occurredAt: '', taskId: taskId(), newDueDate: '2026-07-14' },
      baseState(),
    )).toThrow('not found in state')
  })
})

const P1 = 'proj-1' as ProjectId

interface ProjectLifecycleCase {
  name: string
  event: PalimpsestEvent
  expectedCommands: Array<{ type: string; args: Record<string, unknown> }>
}

const PROJECT_LIFECYCLE_CASES: ProjectLifecycleCase[] = [
  { name: 'project.created work sphere → project_add under work container',
    event: { type: 'project.created', id: EV_ID, occurredAt: '', projectId: P1, sphereId: WORK_SPHERE_ID, name: 'Alpha' },
    expectedCommands: [{ type: 'project_add', args: { name: 'Alpha', parent_id: TODOIST_WORK_PROJECT_ID } }] },

  { name: 'project.created personal sphere → project_add under personal container',
    event: { type: 'project.created', id: EV_ID, occurredAt: '', projectId: P1, sphereId: PERSONAL_SPHERE_ID, name: 'Beta' },
    expectedCommands: [{ type: 'project_add', args: { name: 'Beta', parent_id: TODOIST_PERSONAL_PROJECT_ID } }] },

  { name: 'project.updated name → project_update',
    event: { type: 'project.updated', id: EV_ID, occurredAt: '', projectId: P1, patch: { name: 'New name' } },
    expectedCommands: [{ type: 'project_update', args: { id: P1, name: 'New name' } }] },

  { name: 'project.updated no name → no commands',
    event: { type: 'project.updated', id: EV_ID, occurredAt: '', projectId: P1, patch: {} },
    expectedCommands: [] },

  { name: 'project.created with description → project_add includes description',
    event: { type: 'project.created', id: EV_ID, occurredAt: '', projectId: P1, sphereId: WORK_SPHERE_ID, name: 'Alpha', description: 'the goal' },
    expectedCommands: [{ type: 'project_add', args: { name: 'Alpha', parent_id: TODOIST_WORK_PROJECT_ID, description: 'the goal' } }] },

  { name: 'project.created without description → project_add omits description',
    event: { type: 'project.created', id: EV_ID, occurredAt: '', projectId: P1, sphereId: WORK_SPHERE_ID, name: 'Alpha' },
    expectedCommands: [{ type: 'project_add', args: { name: 'Alpha', parent_id: TODOIST_WORK_PROJECT_ID } }] },

  { name: 'project.updated description → project_update with description',
    event: { type: 'project.updated', id: EV_ID, occurredAt: '', projectId: P1, patch: { description: 'new goal' } },
    expectedCommands: [{ type: 'project_update', args: { id: P1, description: 'new goal' } }] },

  { name: 'project.updated description CLEAR → project_update with empty string description',
    event: { type: 'project.updated', id: EV_ID, occurredAt: '', projectId: P1, patch: { description: null } },
    expectedCommands: [{ type: 'project_update', args: { id: P1, description: '' } }] },

  { name: 'project.updated name + description → single project_update with both args',
    event: { type: 'project.updated', id: EV_ID, occurredAt: '', projectId: P1, patch: { name: 'New name', description: 'new goal' } },
    expectedCommands: [{ type: 'project_update', args: { id: P1, name: 'New name', description: 'new goal' } }] },

  { name: 'project.archived → project_archive',
    event: { type: 'project.archived', id: EV_ID, occurredAt: '', projectId: P1 },
    expectedCommands: [{ type: 'project_archive', args: { id: P1 } }] },

  { name: 'project.unarchived → project_unarchive',
    event: { type: 'project.unarchived', id: EV_ID, occurredAt: '', projectId: P1 },
    expectedCommands: [{ type: 'project_unarchive', args: { id: P1 } }] },
]

describe('buildCommands — project lifecycle', () => {
  it.each(PROJECT_LIFECYCLE_CASES)('$name', ({ event, expectedCommands }) => {
    const { commands, tempId } = buildCommands(event, baseState())
    if (event.type === 'project.created') {
      expect(tempId).toBeDefined()
      expect(commands[0]?.temp_id).toBe(tempId)
    }
    expect(stripIds(commands)).toEqual(expectedCommands)
  })

  // ── Shared agenda-mapping storage task ────────────────────────────────────
  // These thread ctx (rawAgendaMapping/agendaMapTaskId) through in ways specific to each
  // scenario, and assert on agendaMappingAfter/agendaMapTaskTempId alongside commands — they
  // don't reduce to a flat input→command-array row the way the cases above do.

  it('agendaId patch with no ctx → no command (backwards compatible when ctx is omitted)', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
    )
    expect(commands).toHaveLength(0)
  })

  it('agendaId patch with no existing map task → item_add creating the shared storage task in Inbox', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: {} },
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]?.type).toBe('item_add')
    expect(commands[0]?.args.content).toBe(AGENDA_PROJECT_MAP_TASK_TITLE)
    expect(commands[0]?.args.project_id).toBe(TODOIST_INBOX_ID)
    expect(commands[0]?.args.description).toContain('"proj-1": "jim"')
  })

  it('agendaId patch with an existing map task → item_update targeting that task, preserving other entries', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-2': 'me' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]?.type).toBe('item_update')
    expect(commands[0]?.args.id).toBe('maptask1')
    expect(commands[0]?.args.description).toContain('"proj-1": "jim"')
    expect(commands[0]?.args.description).toContain('"proj-2": "me"')
  })

  it('agendaId CLEAR removes just that project\'s entry, keeping others intact', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: CLEAR },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-1': 'jim', 'proj-2': 'me' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(1)
    const description = commands[0]?.args.description as string
    expect(description).not.toContain('proj-1')
    expect(description).toContain('"proj-2": "me"')
  })

  it('agendaId patch combined with name patch → both a project_update and the shared-storage command', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { name: 'New name', agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: {} },
    )
    const types = commands.map(c => c.type)
    expect(types).toContain('project_update')
    expect(types).toContain('item_add')
  })

  it('returns agendaMappingAfter reflecting the applied change', () => {
    const { agendaMappingAfter } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-2': 'me' } },
    )
    expect(agendaMappingAfter).toEqual({ 'proj-1': 'jim', 'proj-2': 'me' })
  })

  it('returns agendaMapTaskTempId matching the item_add temp_id when creating the map task', () => {
    const { commands, agendaMapTaskTempId } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: {} },
    )
    expect(agendaMapTaskTempId).toBeDefined()
    expect(commands[0]?.temp_id).toBe(agendaMapTaskTempId)
  })

  it('does not return agendaMapTaskTempId when updating an already-known map task', () => {
    const { agendaMapTaskTempId } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: {}, agendaMapTaskId: 'maptask1' },
    )
    expect(agendaMapTaskTempId).toBeUndefined()
  })

  it('agendaId CLEAR when the project has no existing mapping entry → no-op, no command emitted', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: CLEAR },
      },
      baseState(),
      { rawAgendaMapping: {} },
    )
    expect(commands).toHaveLength(0)
  })

  it('agendaId set to its already-current value → no-op, no command emitted', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-jim' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-1': 'jim' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(0)
  })

  it('agendaId for an agenda with no Todoist label throws', () => {
    expect(() => buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: 'agenda-ghost' as AgendaId },
      },
      baseState(),
      { rawAgendaMapping: {} },
    )).toThrow('No Todoist label mapped for agenda')
  })

  it('isSelfOnly: true writes "me", preserving other entries', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { isSelfOnly: true },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-2': 'jim' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]?.type).toBe('item_update')
    const description = commands[0]?.args.description as string
    expect(description).toContain('"proj-1": "me"')
    expect(description).toContain('"proj-2": "jim"')
  })

  it('isSelfOnly: false deletes the entry', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { isSelfOnly: false },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-1': 'me', 'proj-2': 'jim' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(1)
    const description = commands[0]?.args.description as string
    expect(description).not.toContain('proj-1')
    expect(description).toContain('"proj-2": "jim"')
  })

  it('isSelfOnly: false on a project whose entry is a real agenda label leaves it untouched', () => {
    const { commands, agendaMappingAfter } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { isSelfOnly: false },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-1': 'jim' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(0)
    expect(agendaMappingAfter).toEqual({ 'proj-1': 'jim' })
  })

  it('agendaId: CLEAR combined with isSelfOnly: true resolves to "me" (isSelfOnly takes precedence)', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId('1'), patch: { agendaId: CLEAR, isSelfOnly: true },
      },
      baseState(),
      { rawAgendaMapping: { 'proj-1': 'jim' }, agendaMapTaskId: 'maptask1' },
    )
    expect(commands).toHaveLength(1)
    const description = commands[0]?.args.description as string
    expect(description).toContain('"proj-1": "me"')
  })

  it('isSelfOnly patch with no ctx → no command (backwards compatible when ctx is omitted)', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { isSelfOnly: true },
      },
      baseState(),
    )
    expect(commands).toHaveLength(0)
  })
})

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('command uuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID when the environment provides it', () => {
    const { commands } = buildCommands(
      { type: 'task.completed', id: evId(), occurredAt: '', taskId: taskId() },
      baseState(),
    )
    expect(commands[0]?.uuid).toMatch(UUID_V4)
  })

  // Regression test: Hermes (React Native's JS engine) doesn't implement crypto.randomUUID even
  // with react-native-get-random-values installed, which only polyfills crypto.getRandomValues.
  // Calling the missing method threw "undefined is not a function" on every single write.
  it('falls back to building a v4 UUID from crypto.getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    const { commands } = buildCommands(
      { type: 'task.completed', id: evId(), occurredAt: '', taskId: taskId() },
      baseState(),
    )

    expect(commands[0]?.uuid).toMatch(UUID_V4)
  })
})
