import { describe, it, expect } from 'vitest'
import { deriveTodoistShape } from './deriveTodoistShape'
import type { TodoistShape, TodoistShapeFields } from './deriveTodoistShape'
import type { AgendaId, ContextId, ProjectId } from '@alnorth/palimpsest'
import {
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_FUTURE_LOG_ID,
  TODOIST_INBOX_ID,
  AGENDA_ID_TO_AGENDA_PROJECT_ID,
  UNSPHERED_LABEL,
} from './mapping'

const jimId = 'agenda-jim' as AgendaId
const waitingForProjectId = 'p1' as ProjectId

function fields(overrides: Partial<TodoistShapeFields> = {}): TodoistShapeFields {
  return { title: 'Task', description: '', ...overrides }
}

// deriveTodoistShape is a pure fields→shape mapping, so its cases enumerate cleanly as a table:
// each row is one (input fields, expected shape fields) pair, checked field-by-field against
// whichever keys `expected` mentions — leaving the rest of the shape unchecked, the same way the
// old per-field `it()` blocks each only asserted on one property of the result.
interface Case {
  name: string
  fields: Partial<TodoistShapeFields>
  expected: Partial<TodoistShape>
}

const CASES: Case[] = [
  // ── content/description ──────────────────────────────────────────────────
  { name: 'content is the title verbatim',
    fields: { title: 'Buy milk' }, expected: { content: 'Buy milk' } },
  { name: 'description passes through when waitingFor is absent',
    fields: { description: 'notes' }, expected: { description: 'notes' } },
  { name: 'description passes through for waitingFor review',
    fields: { description: 'notes', waitingFor: { kind: 'review' } },
    expected: { description: 'notes' } },
  { name: 'description passes through for waitingFor agenda',
    fields: { description: 'notes', waitingFor: { kind: 'agenda', agendaId: jimId } },
    expected: { description: 'notes' } },
  { name: 'description is overridden by the project URL for waitingFor project',
    fields: { description: 'notes', waitingFor: { kind: 'project', projectId: waitingForProjectId } },
    expected: { description: 'https://todoist.com/app/project/p1' } },
  { name: 'description is overridden by the card URL for waitingFor trello',
    fields: { description: 'notes', waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } },
    expected: { description: 'https://trello.com/c/abc' } },

  // ── labels ────────────────────────────────────────────────────────────────
  { name: 'delegates to computeLabels for isNext',
    fields: { isNext: true }, expected: { labels: ['next'] } },
  { name: 'delegates to computeLabels for agendaId when the task has a real project',
    fields: { agendaId: jimId, projectId: 'proj2' as ProjectId }, expected: { labels: ['jim'] } },
  // A project-less task with an agenda that has a dedicated Todoist project lives directly in
  // that project (see the containerProjectId cases below) — project membership alone conveys the
  // agenda, so the label is suppressed rather than physically written, keeping the derived shape
  // truthful to what's actually on the Todoist item.
  { name: "suppresses the agenda label when the task is project-less and lives in its agenda's dedicated project",
    fields: { agendaId: jimId, sphereId: WORK_SPHERE_ID }, expected: { labels: [] } },
  { name: 'delegates to computeLabels for contextId',
    fields: { contextId: 'ctx-quick' as ContextId }, expected: { labels: ['quick'] } },
  { name: 'delegates to computeLabels for waitingFor',
    fields: { waitingFor: { kind: 'review' } }, expected: { labels: ['waiting', 'nonagenda'] } },
  // A project-less, dated task whose sphere couldn't be resolved lands in Inbox instead of a
  // sphere-specific bucket (see freeFloatingProjectFor) — mark it so the read path can tell it
  // apart from a genuinely captured, never-triaged Inbox task and keep it sphere-less on the way
  // back in too, instead of silently defaulting it to Work.
  { name: 'adds the unsphered marker label for a project-less, dated task with no resolvable sphere',
    fields: { dueDate: '2026-08-01' },
    expected: { containerProjectId: TODOIST_INBOX_ID, labels: [UNSPHERED_LABEL] } },
  { name: 'does not add the unsphered marker label for an ordinary sphered free-floating task',
    fields: { sphereId: WORK_SPHERE_ID, dueDate: '2026-08-01' }, expected: { labels: [] } },
  { name: 'does not add the unsphered marker label for an undated sphere-less task (falls back to Work One-Offs, not Inbox)',
    fields: {}, expected: { containerProjectId: TODOIST_WORK_ONEOFFS_ID, labels: [] } },

  // ── priority ──────────────────────────────────────────────────────────────
  { name: 'isStarred true → priority 4', fields: { isStarred: true }, expected: { priority: 4 } },
  { name: 'isStarred absent → priority 1', fields: {}, expected: { priority: 1 } },

  // ── due ───────────────────────────────────────────────────────────────────
  { name: 'neither dueDate nor dueDateExpression → due undefined',
    fields: {}, expected: { due: undefined } },
  { name: 'dueDate only → due { date }',
    fields: { dueDate: '2026-08-01' }, expected: { due: { date: '2026-08-01' } } },
  { name: 'dueDateExpression only → due { string }',
    fields: { dueDateExpression: 'every monday' }, expected: { due: { string: 'every monday' } } },
  { name: 'both → due { date, string }',
    fields: { dueDate: '2026-08-01', dueDateExpression: 'every monday' },
    expected: { due: { date: '2026-08-01', string: 'every monday' } } },

  // ── containerProjectId ───────────────────────────────────────────────────
  { name: 'projectId set → String(projectId), ignoring agenda/due entirely',
    fields: { projectId: 'proj2' as ProjectId, agendaId: jimId, dueDate: '2026-08-01' },
    expected: { containerProjectId: 'proj2' } },
  { name: 'projectId unset with no agenda → delegates to the ordinary free-floating bucket',
    fields: { sphereId: WORK_SPHERE_ID }, expected: { containerProjectId: TODOIST_WORK_ONEOFFS_ID } },
  { name: 'projectId unset with no agenda but a due date → delegates to the due-date bucket',
    fields: { sphereId: WORK_SPHERE_ID, dueDate: '2026-08-01' },
    expected: { containerProjectId: TODOIST_FUTURE_LOG_ID } },
  { name: 'projectId unset with an agenda that has a dedicated project → that project, even with a due date',
    fields: { sphereId: WORK_SPHERE_ID, agendaId: jimId, dueDate: '2026-08-01' },
    expected: { containerProjectId: AGENDA_ID_TO_AGENDA_PROJECT_ID[jimId]! } },
  { name: 'projectId unset, sphereId unset, no due state → falls back to Work One-Offs',
    fields: {}, expected: { containerProjectId: TODOIST_WORK_ONEOFFS_ID } },
  { name: 'respects the Personal sphere for the free-floating bucket',
    fields: { sphereId: PERSONAL_SPHERE_ID }, expected: { containerProjectId: TODOIST_PERSONAL_ONEOFFS_ID } },
]

describe('deriveTodoistShape', () => {
  it.each(CASES)('$name', ({ fields: overrides, expected }) => {
    const shape = deriveTodoistShape(fields(overrides))
    for (const key of Object.keys(expected) as (keyof TodoistShape)[]) {
      expect(shape[key]).toEqual(expected[key])
    }
  })
})
