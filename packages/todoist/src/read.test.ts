import { describe, it, expect } from 'vitest'
import { buildState, applyDelta } from './read.js'
import type { SyncItem, SyncProject } from './api.js'
import {
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_INBOX_ID,
  TODOIST_AGENDAS_ID,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
} from './mapping.js'
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG } from 'palimpsest'
import type { ProjectId, TaskId } from 'palimpsest'

const CONFIG_STATE = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }


// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<SyncProject> & { id: string }): SyncProject {
  return {
    name: 'Test Project',
    parent_id: TODOIST_WORK_PROJECT_ID,
    is_inbox_project: false,
    is_archived: false,
    is_deleted: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeItem(overrides: Partial<SyncItem> & { id: string }): SyncItem {
  return {
    content: 'Test task',
    description: '',
    project_id: TODOIST_WORK_ONEOFFS_ID,
    labels: [],
    priority: 1,
    due: null,
    checked: false,
    is_deleted: false,
    added_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

// Top-level container projects always present in the account
const CONTAINERS: SyncProject[] = [
  makeProject({ id: TODOIST_WORK_PROJECT_ID,     name: 'viaLibri',  parent_id: null }),
  makeProject({ id: TODOIST_PERSONAL_PROJECT_ID, name: 'Personal',  parent_id: null }),
  makeProject({ id: TODOIST_WORK_ONEOFFS_ID,     name: 'One Offs',  parent_id: TODOIST_WORK_PROJECT_ID }),
  makeProject({ id: TODOIST_PERSONAL_ONEOFFS_ID, name: 'One Offs',  parent_id: TODOIST_PERSONAL_PROJECT_ID }),
  makeProject({ id: TODOIST_INBOX_ID,            name: 'Inbox',     parent_id: null, is_inbox_project: true }),
  makeProject({ id: TODOIST_AGENDAS_ID,          name: 'Agendas',   parent_id: TODOIST_WORK_PROJECT_ID }),
]

// ── Projects ──────────────────────────────────────────────────────────────────

describe('buildState — projects', () => {
  it('excludes container/meta projects', () => {
    const state = buildState(CONTAINERS, [], CONFIG_STATE)
    expect(state.projects.size).toBe(0)
  })

  it('includes a sub-project under Work', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    expect(state.projects.get('proj1' as ProjectId)).toMatchObject({
      id: 'proj1',
      sphereId: WORK_SPHERE_ID,
      name: 'Widgets',
    })
  })

  it('includes a sub-project under Personal', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj2', name: 'Garden', parent_id: TODOIST_PERSONAL_PROJECT_ID }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    expect(state.projects.get('proj2' as ProjectId)?.sphereId).toBe(PERSONAL_SPHERE_ID)
  })

  it('skips deleted projects', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj3', name: 'Gone', parent_id: TODOIST_WORK_PROJECT_ID, is_deleted: true }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    expect(state.projects.has('proj3' as ProjectId)).toBe(false)
  })

  it('maps created_at and updated_at to project timestamps', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj4', parent_id: TODOIST_WORK_PROJECT_ID, created_at: '2024-03-01T10:00:00.000Z', updated_at: '2025-06-15T08:30:00.000Z' }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    const proj = state.projects.get('proj4' as ProjectId)
    expect(proj?.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(proj?.updatedAt).toBe('2025-06-15T08:30:00.000Z')
  })

  it('marks archived projects', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj5', name: 'Old', parent_id: TODOIST_WORK_PROJECT_ID, is_archived: true, updated_at: '2025-01-20T12:00:00.000Z' }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    const proj = state.projects.get('proj5' as ProjectId)
    expect(proj?.isArchived).toBe(true)
    expect(proj?.archivedAt).toBe('2025-01-20T12:00:00.000Z')
  })

  it('excludes Agendas sub-projects', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'agProj', name: 'Jim', parent_id: TODOIST_AGENDAS_ID }),
    ]
    const state = buildState(projects, [], CONFIG_STATE)
    expect(state.projects.has('agProj' as ProjectId)).toBe(false)
  })
})

// ── Tasks — sphere and project resolution ─────────────────────────────────────

describe('buildState — task sphere resolution', () => {
  it('work one-offs task → work sphere, no projectId', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1', project_id: TODOIST_WORK_ONEOFFS_ID })], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.sphereId).toBe(WORK_SPHERE_ID)
    expect(task?.projectId).toBeUndefined()
  })

  it('personal one-offs task → personal sphere via personal label', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1', project_id: TODOIST_WORK_ONEOFFS_ID, labels: ['personal'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.sphereId).toBe(PERSONAL_SPHERE_ID)
  })

  it('inbox task defaults to work sphere', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1', project_id: TODOIST_INBOX_ID })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.sphereId).toBe(WORK_SPHERE_ID)
  })

  it('task in a regular project gets projectId from that project', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const state = buildState(projects, [makeItem({ id: 't1', project_id: 'proj1' })], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.projectId).toBe('proj1')
    expect(task?.sphereId).toBeUndefined()
  })

  it('includes completed tasks with status completed', () => {
    const state = buildState(CONTAINERS, [
      makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z' }),
    ], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.status).toBe('completed')
    expect(task?.completedAt).toBe('2026-06-01T10:00:00.000Z')
  })

  it('skips deleted tasks', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1', is_deleted: true })], CONFIG_STATE)
    expect(state.tasks.has('t1' as TaskId)).toBe(false)
  })
})

// ── Tasks — field mapping ─────────────────────────────────────────────────────

describe('buildState — task field mapping', () => {
  const baseProjects = [...CONTAINERS]

  it('priority 4 → isStarred', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', priority: 4 })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.isStarred).toBe(true)
  })

  it('priority 1 → no isStarred', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', priority: 1 })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.isStarred).toBeUndefined()
  })

  it('next label → isNext', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['next'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.isNext).toBe(true)
  })

  it('agenda label → agendaId', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['jim'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.agendaId).toBe('agenda-jim')
  })

  it('context label → contextId', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['quick'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.contextId).toBe('ctx-quick')
  })

  it('due date (non-recurring)', () => {
    const state = buildState(baseProjects, [
      makeItem({ id: 't1', due: { date: '2026-07-01', is_recurring: false, string: 'Jul 1' } }),
    ], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.dueDate).toBe('2026-07-01')
    expect(task?.dueDateExpression).toBeUndefined()
  })

  it('recurring due date → dueDate + dueDateExpression', () => {
    const state = buildState(baseProjects, [
      makeItem({ id: 't1', due: { date: '2026-07-07', is_recurring: true, string: 'every monday' } }),
    ], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.dueDate).toBe('2026-07-07')
    expect(task?.dueDateExpression).toBe('every monday')
  })

  it('due string stored verbatim including ! modifier', () => {
    const state = buildState(baseProjects, [
      makeItem({ id: 't1', due: { date: '2026-07-07', is_recurring: true, string: 'every! monday' } }),
    ], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.dueDateExpression).toBe('every! monday')
  })

  it('description preserved for normal tasks', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', description: 'some notes' })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.description).toBe('some notes')
  })
})

// ── Tasks — waitingFor ────────────────────────────────────────────────────────

describe('buildState — waitingFor', () => {
  const baseProjects = [...CONTAINERS]

  it('waiting label alone → waitingFor review', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['waiting'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.waitingFor).toEqual({ kind: 'review' })
  })

  it('waiting + nonagenda → waitingFor review even with no agenda', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['waiting', 'nonagenda'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.waitingFor).toEqual({ kind: 'review' })
  })

  it('waiting + agenda label → waitingFor agenda', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['waiting', 'jim'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.waitingFor).toEqual({ kind: 'agenda', agendaId: 'agenda-jim' })
  })

  it('waiting + agenda + nonagenda → waitingFor review (nonagenda overrides)', () => {
    const state = buildState(baseProjects, [makeItem({ id: 't1', labels: ['waiting', 'jim', 'nonagenda'] })], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.waitingFor).toEqual({ kind: 'review' })
  })

  it('waiting + project label + url → waitingFor project', () => {
    const state = buildState(baseProjects, [
      makeItem({
        id: 't1',
        labels: ['waiting', 'project'],
        description: 'https://todoist.com/app/project/6JJ9prC5CQMwjRP4',
      }),
    ], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.waitingFor).toEqual({
      kind: 'project',
      projectId: '6JJ9prC5CQMwjRP4',
    })
  })

  it('waiting + trello label → waitingFor trello, description as cardUrl', () => {
    const cardUrl = 'https://trello.com/c/abc123/my-card'
    const state = buildState(baseProjects, [
      makeItem({ id: 't1', labels: ['waiting', 'trello'], description: cardUrl }),
    ], CONFIG_STATE)
    const task = state.tasks.get('t1' as TaskId)
    expect(task?.waitingFor).toEqual({ kind: 'trello', cardUrl })
    // description must be cleared — it holds the URL, not user content
    expect(task?.description).toBe('')
  })

  it('waiting + trello: trello is NOT treated as a context', () => {
    const state = buildState(baseProjects, [
      makeItem({ id: 't1', labels: ['waiting', 'trello'], description: 'https://trello.com/c/x' }),
    ], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.contextId).toBeUndefined()
  })

  it('waiting + project: description is cleared (holds URL, not user content)', () => {
    const state = buildState(baseProjects, [
      makeItem({
        id: 't1',
        labels: ['waiting', 'project'],
        description: 'https://todoist.com/app/project/6JJ9prC5CQMwjRP4',
      }),
    ], CONFIG_STATE)
    expect(state.tasks.get('t1' as TaskId)?.description).toBe('')
  })
})

// ── applyDelta ────────────────────────────────────────────────────────────────

describe('applyDelta', () => {
  it('adds a new project', () => {
    const state = buildState(CONTAINERS, [], CONFIG_STATE)
    applyDelta(state, [makeProject({ id: 'pNew', parent_id: TODOIST_WORK_PROJECT_ID })], [])
    expect(state.projects.has('pNew' as ProjectId)).toBe(true)
  })

  it('maps timestamps from delta project', () => {
    const state = buildState(CONTAINERS, [], CONFIG_STATE)
    applyDelta(state, [makeProject({ id: 'pNew', parent_id: TODOIST_WORK_PROJECT_ID, created_at: '2024-03-01T10:00:00.000Z', updated_at: '2025-06-15T08:30:00.000Z' })], [])
    const proj = state.projects.get('pNew' as ProjectId)
    expect(proj?.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(proj?.updatedAt).toBe('2025-06-15T08:30:00.000Z')
  })

  it('removes a deleted project', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'pDel', parent_id: TODOIST_WORK_PROJECT_ID })]
    const state = buildState(projects, [], CONFIG_STATE)
    applyDelta(state, [makeProject({ id: 'pDel', parent_id: TODOIST_WORK_PROJECT_ID, is_deleted: true })], [])
    expect(state.projects.has('pDel' as ProjectId)).toBe(false)
  })

  it('adds a new task', () => {
    const state = buildState(CONTAINERS, [], CONFIG_STATE)
    applyDelta(state, [], [makeItem({ id: 'tNew' })])
    expect(state.tasks.has('tNew' as TaskId)).toBe(true)
  })

  it('marks a completed task as completed', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1' })], CONFIG_STATE)
    applyDelta(state, [], [makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z' })])
    expect(state.tasks.get('t1' as TaskId)?.status).toBe('completed')
  })

  it('removes a deleted task', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1' })], CONFIG_STATE)
    applyDelta(state, [], [makeItem({ id: 't1', is_deleted: true })])
    expect(state.tasks.has('t1' as TaskId)).toBe(false)
  })

  it('updates an existing task (title change)', () => {
    const state = buildState(CONTAINERS, [makeItem({ id: 't1', content: 'Old title' })], CONFIG_STATE)
    applyDelta(state, [], [makeItem({ id: 't1', content: 'New title' })])
    expect(state.tasks.get('t1' as TaskId)?.title).toBe('New title')
  })
})
