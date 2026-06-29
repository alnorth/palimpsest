import { buildStateFromConfig, PALIMPSEST_CONFIG } from 'palimpsest'
import type { ProjectionState, Task, Project, SphereId, ProjectId, TaskId } from 'palimpsest'
import { getProjects, getAllTasks } from './api.js'
import type { TodoistTask, TodoistProject } from './api.js'
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
  normaliseDueString,
  extractProjectIdFromUrl,
} from './mapping.js'

// ── Project helpers ───────────────────────────────────────────────────────────

function buildProjectMap(raw: TodoistProject[]): Map<string, TodoistProject> {
  return new Map(raw.map(p => [p.id, p]))
}

// Walk up the parent chain to determine which top-level sphere project owns this project.
function resolveSphereId(project: TodoistProject, byId: Map<string, TodoistProject>): SphereId | undefined {
  let current: TodoistProject | undefined = project
  while (current !== undefined) {
    if (current.parentId === TODOIST_WORK_PROJECT_ID)     return WORK_SPHERE_ID
    if (current.parentId === TODOIST_PERSONAL_PROJECT_ID) return PERSONAL_SPHERE_ID
    // Bail out of the Agendas subtree — those are not palimpsest projects
    if (current.parentId === TODOIST_AGENDAS_ID) return undefined
    current = current.parentId !== null ? byId.get(current.parentId) : undefined
  }
  return undefined
}

function buildPalimpsestProjects(
  raw: TodoistProject[],
  byId: Map<string, TodoistProject>,
  now: string,
): Map<ProjectId, Project> {
  const projects = new Map<ProjectId, Project>()
  for (const p of raw) {
    if (EXCLUDED_PROJECT_IDS.has(p.id)) continue
    const sphereId = resolveSphereId(p, byId)
    if (sphereId === undefined) continue
    const id = p.id as ProjectId
    projects.set(id, {
      id,
      sphereId,
      name: p.name,
      createdAt: now,
      updatedAt: now,
      ...(p.isArchived && { isArchived: true, archivedAt: now }),
    })
  }
  return projects
}

// ── Task helpers ──────────────────────────────────────────────────────────────

function resolveSphereFromTask(
  task: TodoistTask,
  byId: Map<string, TodoistProject>,
): SphereId | undefined {
  const proj = byId.get(task.projectId)
  if (proj === undefined) return undefined

  if (!FREE_FLOATING_PROJECT_IDS.has(proj.id)) {
    // Project is a regular palimpsest project — sphere comes from its parent chain
    const s = resolveSphereId(proj, byId)
    return s
  }

  // Free-floating project (Recurring, Future log, One Offs, Inbox):
  // sphere is encoded in a label, or defaults to work for Inbox
  if (task.labels.includes('personal')) return PERSONAL_SPHERE_ID
  return WORK_SPHERE_ID  // Inbox, work one-offs, or unlabelled recurring tasks
}

function resolveProjectId(
  task: TodoistTask,
  byId: Map<string, TodoistProject>,
): ProjectId | undefined {
  if (FREE_FLOATING_PROJECT_IDS.has(task.projectId)) return undefined
  const proj = byId.get(task.projectId)
  if (proj === undefined || EXCLUDED_PROJECT_IDS.has(proj.id)) return undefined
  return task.projectId as ProjectId
}

function todoistPriorityToStarred(priority: number): boolean | undefined {
  return priority === 4 ? true : undefined
}

function buildPalimpsestTask(t: TodoistTask, byId: Map<string, TodoistProject>): Task | undefined {
  const sphereId = resolveSphereFromTask(t, byId)
  if (sphereId === undefined) return undefined

  const projectId = resolveProjectId(t, byId)

  // Agenda: first matching label
  let agendaId = undefined as typeof LABEL_TO_AGENDA_ID[string] | undefined
  for (const label of t.labels) {
    const id = LABEL_TO_AGENDA_ID[label]
    if (id !== undefined) { agendaId = id; break }
  }

  // Context: first matching label
  let contextId = undefined as typeof LABEL_TO_CONTEXT_ID[string] | undefined
  for (const label of t.labels) {
    const id = LABEL_TO_CONTEXT_ID[label]
    if (id !== undefined) { contextId = id; break }
  }

  const isNext = t.labels.includes('next') ? true : undefined
  const isStarred = todoistPriorityToStarred(t.priority)

  // waitingFor
  let waitingFor: Task['waitingFor'] = undefined
  if (t.labels.includes('waiting')) {
    if (t.labels.includes('project')) {
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

  // Due date / recurrence
  let dueDate: string | undefined = undefined
  let dueDateExpression: string | undefined = undefined
  if (t.due !== null) {
    dueDate = t.due.date
    if (t.due.isRecurring) {
      dueDateExpression = normaliseDueString(t.due.string)
    }
  }

  // description: if it's a waitingFor.project task, the URL is structural, not user content
  const description = t.labels.includes('project') && t.labels.includes('waiting') ? '' : t.description

  const task: Task = {
    id: t.id as TaskId,
    title: t.content,
    description,
    status: 'open',
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchState(token: string): Promise<ProjectionState> {
  const now = new Date().toISOString()

  const [rawProjects, rawTasks] = await Promise.all([
    getProjects(token),
    getAllTasks(token),
  ])

  const byId = buildProjectMap(rawProjects)
  const { spheres, agendas, contexts } = buildStateFromConfig(PALIMPSEST_CONFIG)
  const projects = buildPalimpsestProjects(rawProjects, byId, now)

  const tasks = new Map<TaskId, Task>()
  for (const t of rawTasks) {
    if (t.isCompleted) continue
    const task = buildPalimpsestTask(t, byId)
    if (task !== undefined) tasks.set(task.id, task)
  }

  return { spheres, agendas, contexts, projects, tasks }
}
