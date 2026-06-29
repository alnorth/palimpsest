import type { ProjectionState, Task, Project, SphereId, ProjectId, TaskId } from 'palimpsest'
import type { SyncItem, SyncProject } from './api.js'
import {
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_AGENDAS_ID,
  EXCLUDED_PROJECT_IDS,
  FREE_FLOATING_PROJECT_IDS,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  LABEL_TO_AGENDA_ID,
  LABEL_TO_CONTEXT_ID,
  extractProjectIdFromUrl,
} from './mapping.js'

// ── Project helpers ───────────────────────────────────────────────────────────

function buildProjectMap(raw: SyncProject[]): Map<string, SyncProject> {
  return new Map(raw.map(p => [p.id, p]))
}

function resolveSphereId(project: SyncProject, byId: Map<string, SyncProject>): SphereId | undefined {
  let current: SyncProject | undefined = project
  while (current !== undefined) {
    if (current.parent_id === TODOIST_WORK_PROJECT_ID)     return WORK_SPHERE_ID
    if (current.parent_id === TODOIST_PERSONAL_PROJECT_ID) return PERSONAL_SPHERE_ID
    if (current.parent_id === TODOIST_AGENDAS_ID)          return undefined
    current = current.parent_id !== null ? byId.get(current.parent_id) : undefined
  }
  return undefined
}

function buildPalimpsestProjects(
  raw: SyncProject[],
  byId: Map<string, SyncProject>,
): Map<ProjectId, Project> {
  const projects = new Map<ProjectId, Project>()
  for (const p of raw) {
    if (p.is_deleted) continue
    if (EXCLUDED_PROJECT_IDS.has(p.id)) continue
    const sphereId = resolveSphereId(p, byId)
    if (sphereId === undefined) continue
    const id = p.id as ProjectId
    projects.set(id, {
      id,
      sphereId,
      name: p.name,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      ...(p.is_archived && { isArchived: true, archivedAt: p.updated_at }),
    })
  }
  return projects
}

// ── Task helpers ──────────────────────────────────────────────────────────────

function resolveSphereFromTask(
  task: SyncItem,
  byId: Map<string, SyncProject>,
): SphereId | undefined {
  // Free-floating projects encode sphere in a label — no byId lookup needed
  if (FREE_FLOATING_PROJECT_IDS.has(task.project_id)) {
    if (task.labels.includes('personal')) return PERSONAL_SPHERE_ID
    return WORK_SPHERE_ID
  }
  const proj = byId.get(task.project_id)
  if (proj === undefined) return undefined
  return resolveSphereId(proj, byId)
}

function resolveProjectId(
  task: SyncItem,
  byId: Map<string, SyncProject>,
): ProjectId | undefined {
  if (FREE_FLOATING_PROJECT_IDS.has(task.project_id)) return undefined
  const proj = byId.get(task.project_id)
  if (proj === undefined || EXCLUDED_PROJECT_IDS.has(proj.id)) return undefined
  return task.project_id as ProjectId
}

function buildPalimpsestTask(t: SyncItem, byId: Map<string, SyncProject>): Task | undefined {
  const sphereId = resolveSphereFromTask(t, byId)
  if (sphereId === undefined) return undefined

  const projectId = resolveProjectId(t, byId)

  let agendaId = undefined as typeof LABEL_TO_AGENDA_ID[string] | undefined
  for (const label of t.labels) {
    const id = LABEL_TO_AGENDA_ID[label]
    if (id !== undefined) { agendaId = id; break }
  }

  let contextId = undefined as typeof LABEL_TO_CONTEXT_ID[string] | undefined
  for (const label of t.labels) {
    const id = LABEL_TO_CONTEXT_ID[label]
    if (id !== undefined) { contextId = id; break }
  }

  const isNext    = t.labels.includes('next')   ? true      : undefined
  const isStarred = t.priority === 4             ? true      : undefined

  let waitingFor: Task['waitingFor'] = undefined
  if (t.labels.includes('waiting')) {
    if (t.labels.includes('trello')) {
      waitingFor = { kind: 'trello', cardUrl: t.description }
    } else if (t.labels.includes('project')) {
      const linkedProjectId = extractProjectIdFromUrl(t.description)
      if (linkedProjectId !== undefined) {
        waitingFor = { kind: 'project', projectId: linkedProjectId }
      }
    } else if (agendaId !== undefined && !t.labels.includes('nonagenda')) {
      waitingFor = { kind: 'agenda', agendaId }
    } else {
      waitingFor = { kind: 'review' }
    }
  }

  let dueDate: string | undefined = undefined
  let dueDateExpression: string | undefined = undefined
  if (t.due !== null) {
    dueDate = t.due.date
    if (t.due.is_recurring) {
      dueDateExpression = t.due.string
    }
  }

  const isStructuralDescription = t.labels.includes('waiting') &&
    (t.labels.includes('trello') || t.labels.includes('project'))
  const description = isStructuralDescription ? '' : t.description

  const completedAt = t.checked && t.completed_at != null ? t.completed_at : undefined

  const task: Task = {
    id: t.id as TaskId,
    title: t.content,
    description,
    status: t.checked ? 'completed' : 'open',
    createdAt: t.added_at,
    updatedAt: t.updated_at,
    ...(completedAt !== undefined && { completedAt }),
    ...(projectId !== undefined          && { projectId }),
    ...(projectId === undefined          && { sphereId }),
    ...(agendaId !== undefined           && { agendaId }),
    ...(contextId !== undefined          && { contextId }),
    ...(isNext !== undefined             && { isNext }),
    ...(isStarred !== undefined          && { isStarred }),
    ...(waitingFor !== undefined         && { waitingFor }),
    ...(dueDate !== undefined            && { dueDate }),
    ...(dueDateExpression !== undefined  && { dueDateExpression }),
  }

  return task
}

// ── State builder ─────────────────────────────────────────────────────────────

export function buildState(
  rawProjects: SyncProject[],
  rawItems: SyncItem[],
  configState: ProjectionState,
): ProjectionState {
  const byId = buildProjectMap(rawProjects)
  const { spheres, agendas, contexts } = configState
  const projects = buildPalimpsestProjects(rawProjects, byId)

  const tasks = new Map<TaskId, Task>()
  for (const t of rawItems) {
    if (t.is_deleted) continue
    const task = buildPalimpsestTask(t, byId)
    if (task !== undefined) tasks.set(task.id, task)
  }

  return { spheres, agendas, contexts, projects, tasks }
}

// Apply an incremental Sync API delta to an existing state (mutates in place).
export function applyDelta(
  state: ProjectionState,
  projects: SyncProject[],
  items: SyncItem[],
): void {
  // Rebuild project map from what we have so far (needed for sphere resolution)
  const allProjects: SyncProject[] = []
  for (const [, p] of state.projects) {
    allProjects.push({
      id: p.id,
      name: p.name,
      parent_id: null,   // unknown after initial load — rebuild map from delta projects
      is_inbox_project: false,
      is_archived: p.isArchived === true,
      is_deleted: false,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })
  }
  // Delta projects override/supplement the stubs above
  const byIdMutable = new Map(allProjects.map(p => [p.id, p]))
  for (const p of projects) byIdMutable.set(p.id, p)

  for (const p of projects) {
    if (p.is_deleted) {
      state.projects.delete(p.id as ProjectId)
      continue
    }
    if (EXCLUDED_PROJECT_IDS.has(p.id)) continue
    const sphereId = resolveSphereId(p, byIdMutable)
    if (sphereId === undefined) continue
    const id = p.id as ProjectId
    state.projects.set(id, {
      id,
      sphereId,
      name: p.name,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      ...(p.is_archived && { isArchived: true, archivedAt: p.updated_at }),
    })
  }

  for (const t of items) {
    const taskId = t.id as TaskId
    if (t.is_deleted) {
      state.tasks.delete(taskId)
      continue
    }
    const task = buildPalimpsestTask(t, byIdMutable)
    if (task !== undefined) state.tasks.set(taskId, task)
  }
}
