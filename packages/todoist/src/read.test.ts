import { describe, it, expect } from 'vitest'
import { buildEvents, buildDeltaEvents } from './read.js'
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
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG, project } from 'palimpsest'
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

function makeBase(rawProjects = CONTAINERS, rawItems: SyncItem[] = []) {
  return project(buildEvents(rawProjects, rawItems), CONFIG_STATE)
}

// ── buildEvents ───────────────────────────────────────────────────────────────

describe('buildEvents — projects', () => {
  it('returns no project events for container/meta projects', () => {
    const events = buildEvents(CONTAINERS, [])
    const projectEvents = events.filter(e => e.type === 'project.created' || e.type === 'project.archived')
    expect(projectEvents).toHaveLength(0)
  })

  it('emits project.created for a work sub-project', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const events = buildEvents(projects, [])
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).toMatchObject({
      type: 'project.created',
      projectId: 'proj1',
      sphereId: WORK_SPHERE_ID,
      name: 'Widgets',
    })
  })

  it('emits project.created for a personal sub-project with correct sphereId', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj2', name: 'Garden', parent_id: TODOIST_PERSONAL_PROJECT_ID }),
    ]
    const events = buildEvents(projects, [])
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj2')
    expect(created).toMatchObject({ sphereId: PERSONAL_SPHERE_ID })
  })

  it('emits project.created + project.archived for an archived project', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj3', parent_id: TODOIST_WORK_PROJECT_ID, is_archived: true }),
    ]
    const events = buildEvents(projects, [])
    expect(events.filter(e => e.type === 'project.created' && e.projectId === 'proj3')).toHaveLength(1)
    expect(events.filter(e => e.type === 'project.archived' && e.projectId === 'proj3')).toHaveLength(1)
  })

  it('emits no events for a deleted project', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj4', parent_id: TODOIST_WORK_PROJECT_ID, is_deleted: true }),
    ]
    const events = buildEvents(projects, [])
    expect(events.some(e => 'projectId' in e && e.projectId === 'proj4')).toBe(false)
  })

  it('projects the correct state for multiple projects', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'p1', name: 'Alpha', parent_id: TODOIST_WORK_PROJECT_ID }),
      makeProject({ id: 'p2', name: 'Beta',  parent_id: TODOIST_PERSONAL_PROJECT_ID }),
      makeProject({ id: 'p3', name: 'Old',   parent_id: TODOIST_WORK_PROJECT_ID, is_archived: true }),
    ]
    const state = project(buildEvents(projects, []), CONFIG_STATE)
    expect(state.projects.size).toBe(3)
    expect(state.projects.get('p1' as ProjectId)).toMatchObject({ name: 'Alpha', sphereId: WORK_SPHERE_ID })
    expect(state.projects.get('p2' as ProjectId)).toMatchObject({ sphereId: PERSONAL_SPHERE_ID })
    expect(state.projects.get('p3' as ProjectId)).toMatchObject({ isArchived: true })
  })
})

describe('buildEvents — tasks', () => {
  it('emits task.created for a work one-offs task with sphereId', () => {
    const events = buildEvents(CONTAINERS, [makeItem({ id: 't1' })])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({
      type: 'task.created',
      taskId: 't1',
      sphereId: WORK_SPHERE_ID,
    })
    expect(created).not.toHaveProperty('projectId')
  })

  it('emits task.created with projectId for a task in a regular project', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const events = buildEvents(projects, [makeItem({ id: 't1', project_id: 'proj1' })])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ projectId: 'proj1' })
    expect(created).not.toHaveProperty('sphereId')
  })

  it('emits task.created + task.completed for a completed non-recurring task', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z' }),
    ])
    expect(events.filter(e => e.type === 'task.created'  && e.taskId === 't1')).toHaveLength(1)
    expect(events.filter(e => e.type === 'task.completed' && e.taskId === 't1')).toHaveLength(1)
  })

  it('emits task.created (without dueDateExpression) + task.completed for a recurring task completed forever', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z',
        due: { date: '2026-07-07', is_recurring: true, string: 'every monday' } }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toBeDefined()
    expect(created).not.toHaveProperty('dueDateExpression')
    expect(events.filter(e => e.type === 'task.completed' && e.taskId === 't1')).toHaveLength(1)
  })

  it('emits no events for a deleted task', () => {
    const events = buildEvents(CONTAINERS, [makeItem({ id: 't1', is_deleted: true })])
    expect(events.some(e => 'taskId' in e && e.taskId === 't1')).toBe(false)
  })

  it('projects the correct state for tasks with various fields', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const state = project(buildEvents(projects, [
      makeItem({ id: 't1' }),
      makeItem({ id: 't2', project_id: 'proj1', labels: ['next', 'jim'], priority: 4 }),
      makeItem({ id: 't3', checked: true, completed_at: '2026-06-01T10:00:00.000Z' }),
      makeItem({ id: 't4', due: { date: '2026-07-07', is_recurring: true, string: 'every monday' } }),
    ]), CONFIG_STATE)
    expect(state.tasks.size).toBe(4)
    expect(state.tasks.get('t1' as TaskId)).toMatchObject({ sphereId: WORK_SPHERE_ID, status: 'open' })
    expect(state.tasks.get('t2' as TaskId)).toMatchObject({ projectId: 'proj1', isNext: true, agendaId: 'agenda-jim', isStarred: true })
    expect(state.tasks.get('t3' as TaskId)).toMatchObject({ status: 'completed' })
    expect(state.tasks.get('t4' as TaskId)).toMatchObject({ dueDate: '2026-07-07', dueDateExpression: 'every monday' })
  })
})

// ── buildDeltaEvents ──────────────────────────────────────────────────────────

describe('buildDeltaEvents — projects', () => {
  it('emits project.created for a new project', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'pNew', name: 'New Project', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], [])
    expect(events.find(e => e.type === 'project.created' && e.projectId === 'pNew')).toMatchObject({
      sphereId: WORK_SPHERE_ID, name: 'New Project',
    })
  })

  it('emits project.updated for an existing project that changed name', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', name: 'Old', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', name: 'New', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], [])
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ type: 'project.updated', patch: { name: 'New' } })
  })

  it('emits project.archived for a deleted project (not project.deleted)', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'pDel', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'pDel', parent_id: TODOIST_WORK_PROJECT_ID, is_deleted: true }),
    ], [])
    expect(events.some(e => e.type === 'project.archived' && e.projectId === 'pDel')).toBe(true)
    expect(events.some(e => e.type === 'project.created' && e.projectId === 'pDel')).toBe(false)
  })

  it('emits project.archived when is_archived=true and parent_id=null (Todoist clears parent on archive)', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'pArch', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'pArch', parent_id: null, is_archived: true }),
    ], [])
    expect(events.some(e => e.type === 'project.archived' && e.projectId === 'pArch')).toBe(true)
    expect(events.some(e => e.type === 'project.created' && e.projectId === 'pArch')).toBe(false)
  })

  it('emits project.unarchived when is_archived flips false on an existing archived project', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'pUnarch', parent_id: TODOIST_WORK_PROJECT_ID, is_archived: true })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'pUnarch', parent_id: TODOIST_WORK_PROJECT_ID, is_archived: false }),
    ], [])
    expect(events.some(e => e.type === 'project.unarchived' && e.projectId === 'pUnarch')).toBe(true)
  })
})

describe('buildDeltaEvents — tasks', () => {
  it('emits task.created for a new task', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [], [makeItem({ id: 'tNew', content: 'Hello' })])
    expect(events.find(e => e.type === 'task.created' && e.taskId === 'tNew')).toMatchObject({
      title: 'Hello', sphereId: WORK_SPHERE_ID,
    })
  })

  it('emits task.deleted for a deleted task', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1' })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', is_deleted: true })])
    expect(events.some(e => e.type === 'task.deleted' && e.taskId === 't1')).toBe(true)
  })

  it('emits task.updated with only changed fields in the patch', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', content: 'Old' })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', content: 'New' })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.title).toBe('New')
    expect(updated.patch).not.toHaveProperty('sphereId')
    expect(updated.patch).not.toHaveProperty('agendaId')
  })

  it('emits no task.updated when nothing changed', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', content: 'Same' })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', content: 'Same' })])
    expect(events.some(e => e.type === 'task.updated' && e.taskId === 't1')).toBe(false)
  })

  it('emits task.completed when a task transitions open → completed', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1' })])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z' }),
    ])
    expect(events.some(e => e.type === 'task.completed' && e.taskId === 't1')).toBe(true)
  })

  it('emits task.uncompleted when a task transitions completed → open', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z' })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', checked: false })])
    expect(events.some(e => e.type === 'task.uncompleted' && e.taskId === 't1')).toBe(true)
  })

  it('picks up context changes for tasks in regular (non-free-floating) projects', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const base = makeBase(projects, [makeItem({ id: 't1', project_id: 'proj1' })])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: 'proj1', labels: ['tools'] }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.contextId).toBe('ctx-tools')
  })

  it('clears dueDateExpression and emits task.completed when a recurring task is completed forever', () => {
    const base = makeBase(CONTAINERS, [
      makeItem({ id: 't1', due: { date: '2026-07-07', is_recurring: true, string: 'every monday' } }),
    ])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', checked: true, completed_at: '2026-06-01T10:00:00.000Z',
        due: { date: '2026-07-07', is_recurring: true, string: 'every monday' } }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.dueDateExpression).toBeNull()
    expect(events.some(e => e.type === 'task.completed' && e.taskId === 't1')).toBe(true)
  })

  it('clears optional fields in task.updated patch when they are removed', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', labels: ['jim', 'next'] })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1' })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBeNull()
    expect(updated.patch.isNext).toBe(false)
  })
})
