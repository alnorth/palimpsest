import { describe, it, expect } from 'vitest'
import { buildCommands } from './write.js'
import { createEmptyState, buildStateFromConfig } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, TaskId, ProjectId, SphereId, AgendaId, ContextId, EventId } from 'palimpsest'
import { CLEAR } from 'palimpsest'
import {
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
} from './mapping.js'

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

  it('dueDateExpression patch → due.string', () => {
    const { commands } = buildCommands(
      updEvent('t1', { dueDateExpression: 'every monday' }),
      stateWithTask('t1'),
    )
    expect(commands[0]?.args.due).toEqual({ string: 'every monday' })
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

  it('task.recurred → item_update with new due date', () => {
    const { commands } = buildCommands(
      { type: 'task.recurred', id: evId(), occurredAt: '', taskId: taskId(), newDueDate: '2026-07-14' },
      baseState(),
    )
    expect(commands[0]?.type).toBe('item_update')
    expect(commands[0]?.args.due).toEqual({ date: '2026-07-14' })
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
