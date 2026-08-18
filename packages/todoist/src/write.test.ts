import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCommands } from './write'
import { createEmptyState, buildStateFromConfig } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState, TaskId, ProjectId, SphereId, AgendaId, ContextId, EventId } from '@alnorth/palimpsest'
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
} from './mapping'
import { AGENDA_PROJECT_MAP_TASK_TITLE } from './sharedStorage'

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 0
function evId(): EventId { return `ev-${++seq}` as EventId }
function taskId(n = '1'): TaskId { return `task-${n}` as TaskId }
function projId(n = '1'): ProjectId { return `proj-${n}` as ProjectId }

function baseState(extra?: Partial<ProjectionState>): ProjectionState {
  return { ...createEmptyState(), ...extra }
}

function stateWithTask(id: string, overrides: Record<string, unknown> = {}): ProjectionState {
  const state = createEmptyState()
  state.tasks.set(id as TaskId, {
    id: id as TaskId,
    title: 'Existing task',
    description: '',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sphereId: WORK_SPHERE_ID,
    ...overrides,
  } as any)
  return state
}

// ── task.created ──────────────────────────────────────────────────────────────

describe('buildCommands — task.created', () => {
  const event = (overrides: Partial<PalimpsestEvent> = {}): PalimpsestEvent => ({
    type: 'task.created',
    id: evId(),
    occurredAt: '2026-06-29T00:00:00Z',
    taskId: taskId(),
    title: 'Buy milk',
    description: '',
    sphereId: WORK_SPHERE_ID,
    ...overrides,
  } as PalimpsestEvent)

  it('produces one item_add command', () => {
    const { commands } = buildCommands(event(), baseState())
    expect(commands).toHaveLength(1)
    expect(commands[0]?.type).toBe('item_add')
  })

  it('returns a tempId', () => {
    const { tempId } = buildCommands(event(), baseState())
    expect(tempId).toBeDefined()
    expect(typeof tempId).toBe('string')
  })

  it('temp_id in command matches returned tempId', () => {
    const { commands, tempId } = buildCommands(event(), baseState())
    expect(commands[0]?.temp_id).toBe(tempId)
  })

  it('defaults to work one-offs project for work-sphere task with no projectId', () => {
    const { commands } = buildCommands(event({ sphereId: WORK_SPHERE_ID }), baseState())
    expect(commands[0]?.args.project_id).toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('defaults to personal one-offs project for personal-sphere task', () => {
    const { commands } = buildCommands(event({ sphereId: PERSONAL_SPHERE_ID }), baseState())
    expect(commands[0]?.args.project_id).toBe(TODOIST_PERSONAL_ONEOFFS_ID)
  })

  it('uses explicit projectId if provided', () => {
    const state = createEmptyState()
    state.projects.set('myproj' as ProjectId, {
      id: 'myproj' as ProjectId, sphereId: WORK_SPHERE_ID, name: 'X',
      createdAt: '', updatedAt: '',
    })
    const { commands } = buildCommands(
      event({ projectId: 'myproj' as ProjectId, sphereId: undefined }),
      state,
    )
    expect(commands[0]?.args.project_id).toBe('myproj')
  })

  // A new project-less task with an agendaId belongs in that agenda's dedicated Todoist project,
  // mirroring how the read path infers the same agendaId from a task living there — not merely
  // labelled while sitting in whichever due-date-bucketed free-floating container.
  it('agendaId with no projectId → placed directly in the agenda\'s dedicated project, not One-Offs', () => {
    const { commands } = buildCommands(
      event({ agendaId: 'agenda-jim' as AgendaId, sphereId: WORK_SPHERE_ID }),
      baseState(),
    )
    expect(commands[0]?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'])
  })

  it('agendaId takes priority over due date state when choosing the container', () => {
    const { commands } = buildCommands(
      event({ agendaId: 'agenda-jim' as AgendaId, sphereId: WORK_SPHERE_ID, dueDate: '2026-12-01' }),
      baseState(),
    )
    expect(commands[0]?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'])
  })

  it('agendaId with no dedicated Todoist project falls back to the ordinary free-floating container', () => {
    const { commands } = buildCommands(
      event({ agendaId: 'agenda-ghost' as AgendaId, sphereId: WORK_SPHERE_ID }),
      baseState(),
    )
    expect(commands[0]?.args.project_id).toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('isStarred → priority 4', () => {
    const { commands } = buildCommands(event({ isStarred: true }), baseState())
    expect(commands[0]?.args.priority).toBe(4)
  })

  it('no isStarred → priority 1', () => {
    const { commands } = buildCommands(event(), baseState())
    expect(commands[0]?.args.priority).toBe(1)
  })

  it('isNext → next label', () => {
    const { commands } = buildCommands(event({ isNext: true }), baseState())
    expect(commands[0]?.args.labels).toContain('next')
  })

  it('agendaId → agenda label', () => {
    const { commands } = buildCommands(event({ agendaId: 'agenda-jim' as AgendaId }), baseState())
    expect(commands[0]?.args.labels).toContain('jim')
  })

  it('waitingFor project → waiting+project labels + project URL in description', () => {
    const pid = '6JJ9prC5CQMwjRP4' as ProjectId
    const { commands } = buildCommands(
      event({ waitingFor: { kind: 'project', projectId: pid } }),
      baseState(),
    )
    const args = commands[0]?.args
    expect(args?.labels).toContain('waiting')
    expect(args?.labels).toContain('project')
    expect(args?.description).toBe(`https://todoist.com/app/project/${pid}`)
  })

  it('waitingFor trello → waiting+trello labels + cardUrl in description', () => {
    const cardUrl = 'https://trello.com/c/abc'
    const { commands } = buildCommands(
      event({ waitingFor: { kind: 'trello', cardUrl } }),
      baseState(),
    )
    const args = commands[0]?.args
    expect(args?.labels).toContain('waiting')
    expect(args?.labels).toContain('trello')
    expect(args?.description).toBe(cardUrl)
  })

  it('user description included when no structural waitingFor', () => {
    const { commands } = buildCommands(event({ description: 'some notes' }), baseState())
    expect(commands[0]?.args.description).toBe('some notes')
  })

  it('empty description not included', () => {
    const { commands } = buildCommands(event({ description: '' }), baseState())
    expect(commands[0]?.args.description).toBeUndefined()
  })

  it('dueDate included as due.date', () => {
    const { commands } = buildCommands(event({ dueDate: '2026-07-01' }), baseState())
    expect(commands[0]?.args.due).toEqual({ date: '2026-07-01' })
  })

  it('dueDateExpression takes precedence over dueDate as due.string', () => {
    const { commands } = buildCommands(
      event({ dueDateExpression: 'every monday', dueDate: '2026-07-07' }),
      baseState(),
    )
    expect(commands[0]?.args.due).toEqual({ string: 'every monday' })
  })
})

// ── task.updated ──────────────────────────────────────────────────────────────

describe('buildCommands — task.updated', () => {
  const updEvent = (taskIdStr: string, patch: PalimpsestEvent & { type: 'task.updated' } extends { patch: infer P } ? P : never): PalimpsestEvent => ({
    type: 'task.updated',
    id: evId(),
    occurredAt: '2026-06-29T00:00:00Z',
    taskId: taskIdStr as TaskId,
    patch,
  })

  it('returns empty commands when task not in state', () => {
    const { commands } = buildCommands(
      updEvent('t1', { title: 'New title' }),
      baseState(),
    )
    expect(commands).toHaveLength(0)
  })

  it('title patch → content in item_update args', () => {
    const { commands } = buildCommands(
      updEvent('t1', { title: 'Updated' }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.type).toBe('item_update')
    expect(commands[0]?.args.content).toBe('Updated')
  })

  it('isStarred true → priority 4', () => {
    const { commands } = buildCommands(
      updEvent('t1', { isStarred: true }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.priority).toBe(4)
  })

  it('isStarred false → priority 1', () => {
    const { commands } = buildCommands(
      updEvent('t1', { isStarred: false }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.priority).toBe(1)
  })

  it('dueDate patch → due.date', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-08-01' }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.due).toEqual({ date: '2026-08-01' })
  })

  it('dueDate patch on recurring task → due preserves existing expression string', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-08-01' }),
      stateWithTask('t1', { dueDateExpression: 'every monday' }),
    )
    expect(commands[0]?.args.due).toEqual({ date: '2026-08-01', string: 'every monday' })
  })

  it('dueDateExpression patch → due.string', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: 'every monday' }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.due).toEqual({ string: 'every monday' })
  })

  it('both dueDate and dueDateExpression patched → sends both to anchor Todoist to palimpsest date', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-08-04', dueDateExpression: 'every monday' }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.due).toEqual({ date: '2026-08-04', string: 'every monday' })
  })

  it('projectId patch → item_update + item_move', () => {
    const { commands } = buildCommands(
      updEvent('t1', { title: 'New', projectId: 'proj2' as ProjectId }),
      stateWithTask('t1'),
    )
    const types = commands.map(c => c.type)
    expect(types).toContain('item_update')
    expect(types).toContain('item_move')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(moveCmd?.args.project_id).toBe('proj2')
  })

  it('projectId-only patch → only item_move (no item_update with just id)', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: 'proj2' as ProjectId }),
      stateWithTask('t1'),
    )
    expect(commands.every(c => c.type !== 'item_update')).toBe(true)
    expect(commands.some(c => c.type === 'item_move')).toBe(true)
  })

  // A task living only in its agenda project (see AGENDA_PROJECT_IDS in mapping.ts) carries its
  // agendaId with no explicit Todoist label — the project membership alone conveys it. Moving that
  // task onto a real project (task now has both an agenda AND a project) must not silently drop
  // the agenda: the label has to be added explicitly, since the implicit "lives in the agenda
  // project" signal disappears the moment it leaves that project.
  it('moving a task with an implicit agendaId onto a real project → item_move plus item_update carrying the agenda label', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: 'proj2' as ProjectId }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId }),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).toContain('jim')
    expect(moveCmd?.args.project_id).toBe('proj2')
  })

  it('moving a task with no agendaId onto a real project does not spuriously add labels', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: 'proj2' as ProjectId }),
      stateWithTask('t1'),
    )
    expect(commands.every(c => c.type !== 'item_update')).toBe(true)
  })

  it('a task already in a real project with an explicit agenda label moves to a different real project → label still resent', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: 'proj3' as ProjectId }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId, projectId: 'proj2' as ProjectId }),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).toContain('jim')
    expect(moveCmd?.args.project_id).toBe('proj3')
  })

  it('clearing a task\'s project (CLEAR) while it has an agendaId moves it into that agenda\'s dedicated project, with no label recompute needed', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: CLEAR }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId, projectId: 'proj2' as ProjectId }),
    )
    expect(commands.every(c => c.type !== 'item_update')).toBe(true)
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(moveCmd?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'])
  })

  it('clearing a task\'s project (CLEAR) with no agendaId falls back to the due-date-appropriate free-floating container', () => {
    const { commands } = buildCommands(
      updEvent('t1', { projectId: CLEAR }),
      stateWithTask('t1', { projectId: 'proj2' as ProjectId, dueDate: '2026-12-01' }),
    )
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(moveCmd?.args.project_id).toBe(TODOIST_FUTURE_LOG_ID)
  })

  // Setting an agendaId on a task that has no real project — the write-side mirror of the read
  // path's AGENDA_PROJECT_IDS fallback: the task itself moves into that agenda's dedicated
  // project, not merely a label added while it stays in its current free-floating container.
  it('setting agendaId on a project-less task moves it into that agenda\'s dedicated project', () => {
    const { commands } = buildCommands(
      updEvent('t1', { agendaId: 'agenda-jim' as AgendaId }),
      stateWithTask('t1'),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).toContain('jim')
    expect(moveCmd?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'])
  })

  it('clearing agendaId on a project-less task moves it out of the agenda project into the due-date-appropriate free-floating container', () => {
    const { commands } = buildCommands(
      updEvent('t1', { agendaId: CLEAR }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId, dueDateExpression: 'every monday' }),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).not.toContain('jim')
    expect(moveCmd?.args.project_id).toBe(TODOIST_RECURRING_ID)
  })

  it('changing agendaId on a project-less task moves it directly from one agenda\'s project to the other\'s', () => {
    const { commands } = buildCommands(
      updEvent('t1', { agendaId: 'agenda-marcia' as AgendaId }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId }),
    )
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(moveCmd?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-marcia'])
  })

  it('a due date change on a project-less task with an agendaId keeps it in the agenda project rather than a due-date bucket', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-12-01' }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId }),
    )
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(moveCmd?.args.project_id).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'])
  })

  it('a combined agendaId + projectId patch → item_update carries the new agenda label alongside item_move', () => {
    const { commands } = buildCommands(
      updEvent('t1', { agendaId: 'agenda-marcia' as AgendaId, projectId: 'proj2' as ProjectId }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId }),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).toContain('marcia')
    expect(updateCmd?.args.labels).not.toContain('jim')
    expect(moveCmd?.args.project_id).toBe('proj2')
  })

  it('clearing agendaId while moving onto a real project → item_update omits the agenda label, item_move still happens', () => {
    const { commands } = buildCommands(
      updEvent('t1', { agendaId: CLEAR, projectId: 'proj2' as ProjectId }),
      stateWithTask('t1', { agendaId: 'agenda-jim' as AgendaId }),
    )
    const updateCmd = commands.find(c => c.type === 'item_update')
    const moveCmd = commands.find(c => c.type === 'item_move')
    expect(updateCmd?.args.labels).not.toContain('jim')
    expect(moveCmd?.args.project_id).toBe('proj2')
  })

  it('patch with no content fields → no item_update command', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: CLEAR }),
      stateWithTask('t1'),
    )
    expect(commands.every(c => c.type !== 'item_update')).toBe(true)
  })

  it('isNext patch → labels recomputed', () => {
    const { commands } = buildCommands(
      updEvent('t1', { isNext: true }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.labels).toContain('next')
  })

  // ── Free-floating container moves ─────────────────────────────────────────

  it('adding dueDate to undated free-floating task → item_move to Future Log', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-12-01' }),
      stateWithTask('t1'), // no dueDate, no dueDateExpression → One-Offs
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_FUTURE_LOG_ID)
  })

  it('adding dueDateExpression to undated free-floating task → item_move to Recurring', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: 'every monday' }),
      stateWithTask('t1'),
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_RECURRING_ID)
  })

  it('adding dueDateExpression to Future Log task → item_move to Recurring', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: 'every monday' }),
      stateWithTask('t1', { dueDate: '2026-12-01' }), // Future Log
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_RECURRING_ID)
  })

  it('clearing dueDateExpression on Recurring task that has a dueDate → item_move to Future Log', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: CLEAR }),
      stateWithTask('t1', { dueDate: '2026-12-01', dueDateExpression: 'every monday' }),
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_FUTURE_LOG_ID)
  })

  it('clearing dueDate on Future Log task → item_move to One-Offs', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: CLEAR }),
      stateWithTask('t1', { dueDate: '2026-12-01' }),
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('clearing dueDateExpression on Recurring task with no other dueDate → item_move to One-Offs', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: CLEAR }),
      stateWithTask('t1', { dueDateExpression: 'every monday' }),
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('changing dueDate on Future Log task → item_move to Future Log (idempotent)', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2027-01-01' }),
      stateWithTask('t1', { dueDate: '2026-12-01' }),
    )
    const move = commands.find(c => c.type === 'item_move')
    expect(move?.args.project_id).toBe(TODOIST_FUTURE_LOG_ID)
  })

  it('container move + title change → both item_update and item_move', () => {
    const { commands } = buildCommands(
      updEvent('t1', { title: 'New title', dueDate: '2026-12-01' }),
      stateWithTask('t1'),
    )
    expect(commands.some(c => c.type === 'item_update')).toBe(true)
    expect(commands.some(c => c.type === 'item_move')).toBe(true)
    expect(commands[0]?.type).toBe('item_update') // update before move
  })

  it('task with projectId does not get container move', () => {
    const state = createEmptyState()
    state.tasks.set('t1' as TaskId, {
      id: 't1' as TaskId, title: 'Task', description: '', status: 'open',
      createdAt: '', updatedAt: '', projectId: 'proj1' as ProjectId,
    } as any)
    const { commands } = buildCommands(
      updEvent('t1', { dueDate: '2026-12-01' }),
      state,
    )
    expect(commands.every(c => c.type !== 'item_move')).toBe(true)
  })
})

// ── Other event types ─────────────────────────────────────────────────────────

describe('buildCommands — task lifecycle', () => {
  it('task.completed → item_close', () => {
    const { commands } = buildCommands(
      { type: 'task.completed', id: evId(), occurredAt: '', taskId: taskId() },
      baseState(),
    )
    expect(commands[0]?.type).toBe('item_close')
    expect(commands[0]?.args.id).toBe(taskId())
  })

  it('task.uncompleted → item_uncomplete', () => {
    const { commands } = buildCommands(
      { type: 'task.uncompleted', id: evId(), occurredAt: '', taskId: taskId() },
      baseState(),
    )
    expect(commands[0]?.type).toBe('item_uncomplete')
  })

  it('task.recurred → item_update_date_complete with new due date', () => {
    const id = taskId()
    const { commands } = buildCommands(
      { type: 'task.recurred', id: evId(), occurredAt: '', taskId: id, newDueDate: '2026-07-14' },
      stateWithTask(id, { dueDateExpression: 'every week' }),
    )
    expect(commands[0]?.type).toBe('item_update_date_complete')
    expect(commands[0]?.args.due).toEqual({ date: '2026-07-14', string: 'every week' })
    expect(commands[0]?.args.is_forward).toBe(1)
  })

  it('task.recurred → throws if task not in state', () => {
    expect(() => buildCommands(
      { type: 'task.recurred', id: evId(), occurredAt: '', taskId: taskId(), newDueDate: '2026-07-14' },
      baseState(),
    )).toThrow('not found in state')
  })

  it('task.deleted → item_delete', () => {
    const { commands } = buildCommands(
      { type: 'task.deleted', id: evId(), occurredAt: '', taskId: taskId() },
      baseState(),
    )
    expect(commands[0]?.type).toBe('item_delete')
  })
})

describe('buildCommands — project lifecycle', () => {
  it('project.created work sphere → project_add under work container', () => {
    const { commands, tempId } = buildCommands(
      {
        type: 'project.created', id: evId(), occurredAt: '',
        projectId: projId(), sphereId: WORK_SPHERE_ID, name: 'Alpha',
      },
      baseState(),
    )
    expect(commands[0]?.type).toBe('project_add')
    expect(commands[0]?.args.parent_id).toBe(TODOIST_WORK_PROJECT_ID)
    expect(tempId).toBeDefined()
  })

  it('project.created personal sphere → project_add under personal container', () => {
    const { commands } = buildCommands(
      {
        type: 'project.created', id: evId(), occurredAt: '',
        projectId: projId(), sphereId: PERSONAL_SPHERE_ID, name: 'Beta',
      },
      baseState(),
    )
    expect(commands[0]?.args.parent_id).toBe(TODOIST_PERSONAL_PROJECT_ID)
  })

  it('project.updated name → project_update', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { name: 'New name' },
      },
      baseState(),
    )
    expect(commands[0]?.type).toBe('project_update')
    expect(commands[0]?.args.name).toBe('New name')
  })

  it('project.updated no name → no commands', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: {},
      },
      baseState(),
    )
    expect(commands).toHaveLength(0)
  })

  it('project.created with description → project_add includes description', () => {
    const { commands } = buildCommands(
      {
        type: 'project.created', id: evId(), occurredAt: '',
        projectId: projId(), sphereId: WORK_SPHERE_ID, name: 'Alpha', description: 'the goal',
      },
      baseState(),
    )
    expect(commands[0]?.args.description).toBe('the goal')
  })

  it('project.created without description → project_add omits description', () => {
    const { commands } = buildCommands(
      {
        type: 'project.created', id: evId(), occurredAt: '',
        projectId: projId(), sphereId: WORK_SPHERE_ID, name: 'Alpha',
      },
      baseState(),
    )
    expect(commands[0]?.args.description).toBeUndefined()
  })

  it('project.updated description → project_update with description', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { description: 'new goal' },
      },
      baseState(),
    )
    expect(commands[0]?.type).toBe('project_update')
    expect(commands[0]?.args.description).toBe('new goal')
  })

  it('project.updated description CLEAR → project_update with empty string description', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { description: null },
      },
      baseState(),
    )
    expect(commands[0]?.args.description).toBe('')
  })

  it('project.updated name + description → single project_update with both args', () => {
    const { commands } = buildCommands(
      {
        type: 'project.updated', id: evId(), occurredAt: '',
        projectId: projId(), patch: { name: 'New name', description: 'new goal' },
      },
      baseState(),
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]?.args.name).toBe('New name')
    expect(commands[0]?.args.description).toBe('new goal')
  })

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

  it('project.archived → project_archive', () => {
    const { commands } = buildCommands(
      { type: 'project.archived', id: evId(), occurredAt: '', projectId: projId() },
      baseState(),
    )
    expect(commands[0]?.type).toBe('project_archive')
  })

  it('project.unarchived → project_unarchive', () => {
    const { commands } = buildCommands(
      { type: 'project.unarchived', id: evId(), occurredAt: '', projectId: projId() },
      baseState(),
    )
    expect(commands[0]?.type).toBe('project_unarchive')
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
