import { describe, it, expect } from 'vitest'
import { buildEvents, buildDeltaEvents } from './read'
import type { SyncItem, SyncProject } from './api'
import {
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_INBOX_ID,
  TODOIST_AGENDAS_ID,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  AGENDA_ID_TO_AGENDA_PROJECT_ID,
  UNSPHERED_LABEL,
} from './mapping'
import { AGENDA_PROJECT_MAP_TASK_TITLE, serializeAgendaMapping } from './sharedStorage'
import { buildStateFromConfig, createEmptyState, PALIMPSEST_CONFIG, project, CLEAR } from '@alnorth/palimpsest'
import type { ProjectId, TaskId } from '@alnorth/palimpsest'

const CONFIG_STATE = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<SyncProject> & { id: string }): SyncProject {
  return {
    name: 'Test Project',
    description: '',
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
    parent_id: null,
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

function makeMapTask(mapping: Record<string, string>, overrides: Partial<SyncItem> = {}): SyncItem {
  return makeItem({
    id: 'maptask1',
    content: AGENDA_PROJECT_MAP_TASK_TITLE,
    project_id: TODOIST_INBOX_ID,
    description: serializeAgendaMapping(mapping),
    ...overrides,
  })
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

  it('includes description in project.created when present', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID, description: 'the goal' }),
    ]
    const events = buildEvents(projects, [])
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).toMatchObject({ description: 'the goal' })
  })

  it('omits description from project.created when empty', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID, description: '' }),
    ]
    const events = buildEvents(projects, [])
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).not.toHaveProperty('description')
  })

  it('emits agendaId in project.created when the shared storage task maps it', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const items = [makeMapTask({ proj1: 'jim' })]
    const events = buildEvents(projects, items)
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).toMatchObject({ agendaId: 'agenda-jim' })
  })

  it('omits agendaId but sets isSelfOnly when the project is mapped to "me"', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const items = [makeMapTask({ proj1: 'me' })]
    const events = buildEvents(projects, items)
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).not.toHaveProperty('agendaId')
    expect(created).toMatchObject({ isSelfOnly: true })
  })

  it('omits both agendaId and isSelfOnly when there is no shared storage task at all', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const events = buildEvents(projects, [])
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).not.toHaveProperty('agendaId')
    expect(created).not.toHaveProperty('isSelfOnly')
  })

  it('omits both agendaId and isSelfOnly for a project absent from the mapping, distinguishing it from "me"', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', name: 'Widgets', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const items = [makeMapTask({ someOtherProject: 'jim' })]
    const events = buildEvents(projects, items)
    const created = events.find(e => e.type === 'project.created' && e.projectId === 'proj1')
    expect(created).not.toHaveProperty('agendaId')
    expect(created).not.toHaveProperty('isSelfOnly')
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

  it('never emits a task.created event for the shared agenda-mapping storage task itself', () => {
    const events = buildEvents(CONTAINERS, [makeMapTask({ proj1: 'jim' }), makeItem({ id: 't1' })])
    expect(events.some(e => e.type === 'task.created' && e.taskId === 'maptask1')).toBe(false)
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1')).toBe(true)
  })

  it('never emits a task.created event for any other known dashboard storage task', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 'ghPr', content: '* _GITHUB_PR_DATA_' }),
      makeItem({ id: 'starred', content: '* _STARRED_ITEMS_' }),
      makeItem({ id: 'overview', content: '* _PROJECT_OVERVIEW_MAPPING_' }),
      makeItem({ id: 'basics', content: '* _DAILY_BASICS_DATA_' }),
      makeItem({ id: 'checklist', content: '* _DAILY_CHECKLIST_DATA_' }),
      makeItem({ id: 't1' }),
    ])
    for (const id of ['ghPr', 'starred', 'overview', 'basics', 'checklist']) {
      expect(events.some(e => e.type === 'task.created' && e.taskId === id)).toBe(false)
    }
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1')).toBe(true)
  })

  it('never emits a task.created event for a sub-task of another task', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1' }),
      makeItem({ id: 't1-sub', parent_id: 't1' }),
    ])
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1')).toBe(true)
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1-sub')).toBe(false)
  })

  it('does not set waitingFor for a task with only the waiting label', () => {
    const events = buildEvents(CONTAINERS, [makeItem({ id: 't1', labels: ['waiting'] })])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).not.toHaveProperty('waitingFor')
  })

  it('sets waitingFor review only when waiting is paired with nonagenda', () => {
    const events = buildEvents(CONTAINERS, [makeItem({ id: 't1', labels: ['waiting', 'nonagenda'] })])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ waitingFor: { kind: 'review' } })
  })

  it('sets waitingFor agenda when waiting is paired with an agenda label', () => {
    const events = buildEvents(CONTAINERS, [makeItem({ id: 't1', labels: ['waiting', 'jim'] })])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ waitingFor: { kind: 'agenda', agendaId: 'agenda-jim' } })
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

describe('buildEvents — Inbox sphere resolution', () => {
  it('a plain Inbox task with no personal label defaults to Work sphere', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: TODOIST_INBOX_ID }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ sphereId: WORK_SPHERE_ID })
  })

  it('an Inbox task carrying the personal label resolves to Personal sphere', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: TODOIST_INBOX_ID, labels: ['personal'] }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ sphereId: PERSONAL_SPHERE_ID })
  })

  // A dated, project-less task whose sphere couldn't be resolved is parked in Inbox by the write
  // path (freeFloatingProjectFor) rather than guessing a sphere. Without a marker, it would
  // silently come back as a Work-sphere task on the very next sync — the read path must stay
  // resilient and skip it instead, the same way any other unresolvable-sphere task is skipped.
  it('a dated Inbox task marked unsphered is skipped entirely, not defaulted to Work', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({
        id: 't1', project_id: TODOIST_INBOX_ID,
        labels: [UNSPHERED_LABEL],
        due: { date: '2026-08-01', is_recurring: false, string: '' },
      }),
    ])
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1')).toBe(false)
  })
})

describe('buildEvents — agenda-specific projects', () => {
  const JIM_AGENDA_PROJECT_ID = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim']!
  const HAN_AGENDA_PROJECT_ID = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-han']!

  it('imports a task living in a work agenda project as project-less, with that agendaId and sphere', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ sphereId: WORK_SPHERE_ID, agendaId: 'agenda-jim' })
    expect(created).not.toHaveProperty('projectId')
  })

  it('imports a task living in a personal agenda project with the personal sphere', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: HAN_AGENDA_PROJECT_ID }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ sphereId: PERSONAL_SPHERE_ID, agendaId: 'agenda-han' })
    expect(created).not.toHaveProperty('projectId')
  })

  it('never emits a project.created event for an agenda-specific project itself', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: JIM_AGENDA_PROJECT_ID, name: 'Jim', parent_id: TODOIST_AGENDAS_ID }),
    ]
    const events = buildEvents(projects, [makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID })])
    expect(events.some(e => e.type === 'project.created' && e.projectId === JIM_AGENDA_PROJECT_ID)).toBe(false)
  })

  it('an explicit agenda label on a task in a regular project still resolves agendaId normally', () => {
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const events = buildEvents(projects, [
      makeItem({ id: 't1', project_id: 'proj1', labels: ['jim'] }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ projectId: 'proj1', agendaId: 'agenda-jim' })
  })

  it('an explicit agenda label takes priority over a conflicting agenda-project inference', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID, labels: ['marcia'] }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ agendaId: 'agenda-marcia' })
  })

  it('derives waitingFor kind agenda from the project-inferred agendaId when only the waiting label is present', () => {
    const events = buildEvents(CONTAINERS, [
      makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID, labels: ['waiting'] }),
    ])
    const created = events.find(e => e.type === 'task.created' && e.taskId === 't1')
    expect(created).toMatchObject({ waitingFor: { kind: 'agenda', agendaId: 'agenda-jim' } })
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

  it('emits project.created with description for a new project when present', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'pNew', name: 'New Project', parent_id: TODOIST_WORK_PROJECT_ID, description: 'the goal' }),
    ], [])
    expect(events.find(e => e.type === 'project.created' && e.projectId === 'pNew')).toMatchObject({
      description: 'the goal',
    })
  })

  it('emits project.updated with description in patch when it changes', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', description: 'old goal', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', description: 'new goal', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], [])
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ type: 'project.updated', patch: { description: 'new goal' } })
  })

  it('emits project.updated with description CLEAR when the description is removed', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', description: 'old goal', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', description: '', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], [])
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ type: 'project.updated', patch: { description: CLEAR } })
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

describe('buildDeltaEvents — shared project/agenda mapping', () => {
  it('folds agendaId into the patch when the project itself also changed in this delta', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', name: 'Old', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'jim' })]
    const base = makeBase(projects, items)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', name: 'New', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], items)
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ patch: { name: 'New', agendaId: 'agenda-jim' } })
  })

  it('folds isSelfOnly into the patch when the project itself also changed in this delta', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', name: 'Old', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'me' })]
    const base = makeBase(projects, items)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', name: 'New', parent_id: TODOIST_WORK_PROJECT_ID }),
    ], items)
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ patch: { name: 'New', isSelfOnly: true, agendaId: CLEAR } })
  })

  it('emits project.updated with agendaId CLEAR when the mapping entry is removed but the project itself did not change', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'jim' })]
    const base = makeBase(projects, items)
    const updatedMapTask = makeMapTask({})
    const events = buildDeltaEvents(base, [], [updatedMapTask])
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ patch: { agendaId: CLEAR } })
  })

  it('emits project.updated with the new agendaId when only the mapping (not the project) changes', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'jim' })]
    const base = makeBase(projects, items)
    const updatedMapTask = makeMapTask({ p1: 'han' })
    const events = buildDeltaEvents(base, [], [updatedMapTask])
    const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
    expect(updated).toMatchObject({ patch: { agendaId: 'agenda-han' } })
  })

  it('emits no project.updated when the mapping is unchanged', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'jim' })]
    const base = makeBase(projects, items)
    const sameMapTask = makeMapTask({ p1: 'jim' })
    const events = buildDeltaEvents(base, [], [sameMapTask])
    expect(events.some(e => e.type === 'project.updated' && e.projectId === 'p1')).toBe(false)
  })

  // The four quadrants of the "mapping-only-changed" branch: agendaId and isSelfOnly diff
  // independently, and only the field(s) that actually changed should appear in the patch.
  describe('mapping-only-changed branch: independent agendaId/isSelfOnly diffing', () => {
    it('neither changed → no project.updated event at all', () => {
      const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
      const items = [makeMapTask({ p1: 'jim' })]
      const base = makeBase(projects, items)
      const events = buildDeltaEvents(base, [], [makeMapTask({ p1: 'jim' })])
      expect(events.some(e => e.type === 'project.updated' && e.projectId === 'p1')).toBe(false)
    })

    it('only agendaId changed → patch has agendaId only, no isSelfOnly key', () => {
      const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
      const items = [makeMapTask({ p1: 'jim' })]
      const base = makeBase(projects, items)
      const events = buildDeltaEvents(base, [], [makeMapTask({ p1: 'han' })])
      const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
      if (updated?.type !== 'project.updated') throw new Error('Expected project.updated event')
      expect(updated.patch.agendaId).toBe('agenda-han')
      expect(updated.patch).not.toHaveProperty('isSelfOnly')
    })

    it('only isSelfOnly changed → patch has isSelfOnly only, no agendaId key', () => {
      // p1 starts unmapped (no agendaId either way), so the "me" transition only flips isSelfOnly —
      // switching from a real label to "me" would change both fields, which isn't this case.
      const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
      const items = [makeMapTask({})]
      const base = makeBase(projects, items)
      const events = buildDeltaEvents(base, [], [makeMapTask({ p1: 'me' })])
      const updated = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
      if (updated?.type !== 'project.updated') throw new Error('Expected project.updated event')
      expect(updated.patch.isSelfOnly).toBe(true)
      expect(updated.patch).not.toHaveProperty('agendaId')
    })

    it('both changed → patch has both fields', () => {
      const projects = [
        ...CONTAINERS,
        makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID }),
        makeProject({ id: 'p2', parent_id: TODOIST_WORK_PROJECT_ID }),
      ]
      const items = [makeMapTask({ p1: 'jim', p2: 'me' })]
      const base = makeBase(projects, items)
      const events = buildDeltaEvents(base, [], [makeMapTask({ p1: 'me', p2: 'jim' })])
      const u1 = events.find(e => e.type === 'project.updated' && e.projectId === 'p1')
      const u2 = events.find(e => e.type === 'project.updated' && e.projectId === 'p2')
      if (u1?.type !== 'project.updated' || u2?.type !== 'project.updated') throw new Error('Expected project.updated events')
      expect(u1.patch).toMatchObject({ agendaId: CLEAR, isSelfOnly: true })
      expect(u2.patch).toMatchObject({ agendaId: 'agenda-jim', isSelfOnly: false })
    })
  })

  it('does not emit a spurious project.updated for a project deleted in the same delta as its mapping entry removal', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const items = [makeMapTask({ p1: 'jim' })]
    const base = makeBase(projects, items)
    const events = buildDeltaEvents(base, [
      makeProject({ id: 'p1', parent_id: TODOIST_WORK_PROJECT_ID, is_deleted: true }),
    ], [makeMapTask({})])
    expect(events.filter(e => e.type === 'project.updated' && e.projectId === 'p1')).toHaveLength(0)
    expect(events.some(e => e.type === 'project.archived' && e.projectId === 'p1')).toBe(true)
  })

  it('never emits task events for the shared storage task appearing in a delta', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [], [makeMapTask({ proj1: 'jim' })])
    expect(events.some(e => 'taskId' in e && e.taskId === 'maptask1')).toBe(false)
  })

  it('never emits a task.created event for any other known dashboard storage task appearing in a delta', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 'ghPr', content: '* _GITHUB_PR_DATA_' }),
      makeItem({ id: 't1', content: 'Real task' }),
    ])
    expect(events.some(e => e.type === 'task.created' && e.taskId === 'ghPr')).toBe(false)
    expect(events.some(e => e.type === 'task.created' && e.taskId === 't1')).toBe(true)
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

  it('never emits a task.created event for a new sub-task appearing in a delta', () => {
    const base = makeBase()
    const events = buildDeltaEvents(base, [], [makeItem({ id: 'tSub', parent_id: 'tParent' })])
    expect(events.some(e => e.type === 'task.created' && e.taskId === 'tSub')).toBe(false)
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

  it('moving a task from its agenda project (implicit agendaId) into a real project with an explicit agenda label keeps the same agendaId', () => {
    const JIM_AGENDA_PROJECT_ID = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim']!
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    // Starts living directly in Jim's agenda project — no project, agendaId inferred implicitly.
    const base = makeBase(projects, [
      makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID }),
    ])
    expect(base.tasks.get('t1' as TaskId)).toMatchObject({ sphereId: WORK_SPHERE_ID, agendaId: 'agenda-jim' })
    expect(base.tasks.get('t1' as TaskId)).not.toHaveProperty('projectId')

    // Moves to a real project; the write path is responsible for adding the 'jim' label
    // (see write.test.ts) so the agenda association survives leaving the agenda project.
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: 'proj1', labels: ['jim'] }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.projectId).toBe('proj1')
    expect(updated.patch).not.toHaveProperty('agendaId')

    const next = project(events, base)
    expect(next.tasks.get('t1' as TaskId)).toMatchObject({ projectId: 'proj1', agendaId: 'agenda-jim' })
  })

  it('moving a task out of its agenda project into a real project without carrying the label loses the agendaId', () => {
    const JIM_AGENDA_PROJECT_ID = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim']!
    const projects = [
      ...CONTAINERS,
      makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID }),
    ]
    const base = makeBase(projects, [
      makeItem({ id: 't1', project_id: JIM_AGENDA_PROJECT_ID }),
    ])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: 'proj1' }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBeNull()
  })
})

// Every remaining transition into/out of/between agenda-specific projects, beyond the two
// (agenda-only -> project+label, and its lossy without-label counterpart) already covered above.
describe('buildDeltaEvents — agenda-specific project transitions', () => {
  const JIM_ID     = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim']!
  const MARCIA_ID  = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-marcia']!
  const HAN_ID     = AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-han']!

  it('free-floating (no agenda) → agenda project: gains agendaId and adopts the agenda project\'s sphere', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1' })]) // work one-offs, no agenda
    expect(base.tasks.get('t1' as TaskId)).toMatchObject({ sphereId: WORK_SPHERE_ID })
    expect(base.tasks.get('t1' as TaskId)).not.toHaveProperty('agendaId')

    // Han's agenda project is in the personal sphere — the task's sphere flips too.
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', project_id: HAN_ID })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBe('agenda-han')
    expect(updated.patch.sphereId).toBe(PERSONAL_SPHERE_ID)

    const next = project(events, base)
    expect(next.tasks.get('t1' as TaskId)).toMatchObject({ sphereId: PERSONAL_SPHERE_ID, agendaId: 'agenda-han' })
  })

  it('agenda project → free-floating with no label: loses agendaId and reverts to the label-driven default sphere', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', project_id: HAN_ID })])
    expect(base.tasks.get('t1' as TaskId)).toMatchObject({ sphereId: PERSONAL_SPHERE_ID, agendaId: 'agenda-han' })

    // Moves to the work one-offs container with no 'personal' label — sphere falls back to work.
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1' })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBeNull()
    expect(updated.patch.sphereId).toBe(WORK_SPHERE_ID)
  })

  it('real project (no agenda) → agenda project: gains agendaId, loses projectId', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects, [makeItem({ id: 't1', project_id: 'proj1' })])
    expect(base.tasks.get('t1' as TaskId)).toMatchObject({ projectId: 'proj1' })
    expect(base.tasks.get('t1' as TaskId)).not.toHaveProperty('agendaId')

    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', project_id: JIM_ID })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.projectId).toBeNull()
    expect(updated.patch.agendaId).toBe('agenda-jim')
  })

  it('real project + explicit label → that same agenda\'s project (label kept): agendaId unchanged, loses projectId', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects, [makeItem({ id: 't1', project_id: 'proj1', labels: ['jim'] })])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: JIM_ID, labels: ['jim'] }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.projectId).toBeNull()
    expect(updated.patch).not.toHaveProperty('agendaId')
  })

  it('real project + explicit label → that same agenda\'s project (label dropped): agendaId still unchanged via the project fallback', () => {
    const projects = [...CONTAINERS, makeProject({ id: 'proj1', parent_id: TODOIST_WORK_PROJECT_ID })]
    const base = makeBase(projects, [makeItem({ id: 't1', project_id: 'proj1', labels: ['jim'] })])
    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: JIM_ID }), // no labels
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.projectId).toBeNull()
    expect(updated.patch).not.toHaveProperty('agendaId')
  })

  it('agenda project A → agenda project B (both implicit): agendaId updates to the new agenda', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', project_id: JIM_ID })])
    const events = buildDeltaEvents(base, [], [makeItem({ id: 't1', project_id: MARCIA_ID })])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBe('agenda-marcia')
    expect(updated.patch).not.toHaveProperty('projectId')
  })

  it('an explicit label added while already in a (different) agenda\'s project overrides the project inference', () => {
    const base = makeBase(CONTAINERS, [makeItem({ id: 't1', project_id: JIM_ID })])
    expect(base.tasks.get('t1' as TaskId)).toMatchObject({ agendaId: 'agenda-jim' })

    const events = buildDeltaEvents(base, [], [
      makeItem({ id: 't1', project_id: JIM_ID, labels: ['marcia'] }),
    ])
    const updated = events.find(e => e.type === 'task.updated' && e.taskId === 't1')
    if (updated?.type !== 'task.updated') throw new Error('Expected task.updated event')
    expect(updated.patch.agendaId).toBe('agenda-marcia')
  })
})
