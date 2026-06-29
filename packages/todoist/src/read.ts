import type { ProjectionState, Task, Project, SphereId, ProjectId, TaskId, PalimpsestEvent, TaskPatch } from 'palimpsest'
import { CLEAR, newEventId } from 'palimpsest'
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
    // Don't set dueDateExpression for checked tasks: checked + is_recurring means
    // "completed forever" — the recurrence has ended. Clear it so task.completed works.
    if (t.due.is_recurring && !t.checked) {
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


function taskUpdatedPatch(existing: Task, task: Task): TaskPatch {
  const patch: TaskPatch = {}
  if (task.title       !== existing.title)       patch.title       = task.title
  if (task.description !== existing.description) patch.description = task.description
  if (task.projectId   !== existing.projectId)   patch.projectId   = task.projectId   ?? CLEAR
  if (task.sphereId    !== existing.sphereId)    patch.sphereId    = task.sphereId    ?? CLEAR
  if (task.agendaId    !== existing.agendaId)    patch.agendaId    = task.agendaId    ?? CLEAR
  if (task.contextId   !== existing.contextId)   patch.contextId   = task.contextId   ?? CLEAR
  if ((task.isNext    === true) !== (existing.isNext    === true)) patch.isNext    = task.isNext    === true
  if ((task.isStarred === true) !== (existing.isStarred === true)) patch.isStarred = task.isStarred === true
  if (JSON.stringify(task.waitingFor)  !== JSON.stringify(existing.waitingFor))  patch.waitingFor        = task.waitingFor        ?? CLEAR
  if (task.dueDate           !== existing.dueDate)           patch.dueDate           = task.dueDate           ?? CLEAR
  if (task.dueDateExpression !== existing.dueDateExpression) patch.dueDateExpression = task.dueDateExpression ?? CLEAR
  return patch
}

function taskCreatedEvent(task: Task): Extract<PalimpsestEvent, { type: 'task.created' }> {
  return {
    id: newEventId(), type: 'task.created',
    taskId: task.id, title: task.title, description: task.description,
    occurredAt: task.createdAt,
    ...(task.projectId         !== undefined && { projectId:         task.projectId }),
    ...(task.sphereId          !== undefined && { sphereId:          task.sphereId }),
    ...(task.agendaId          !== undefined && { agendaId:          task.agendaId }),
    ...(task.contextId         !== undefined && { contextId:         task.contextId }),
    ...(task.isNext            !== undefined && { isNext:            task.isNext }),
    ...(task.isStarred         !== undefined && { isStarred:         task.isStarred }),
    ...(task.waitingFor        !== undefined && { waitingFor:        task.waitingFor }),
    ...(task.dueDate           !== undefined && { dueDate:           task.dueDate }),
    ...(task.dueDateExpression !== undefined && { dueDateExpression: task.dueDateExpression }),
  }
}

export function buildEvents(
  rawProjects: SyncProject[],
  rawItems: SyncItem[],
): PalimpsestEvent[] {
  const byId = buildProjectMap(rawProjects)
  const events: PalimpsestEvent[] = []

  for (const p of buildPalimpsestProjects(rawProjects, byId).values()) {
    events.push({
      id: newEventId(), type: 'project.created',
      projectId: p.id, sphereId: p.sphereId, name: p.name,
      occurredAt: p.createdAt,
    })
    if (p.isArchived === true) {
      events.push({
        id: newEventId(), type: 'project.archived',
        projectId: p.id, occurredAt: p.archivedAt ?? p.updatedAt,
      })
    }
  }

  for (const t of rawItems) {
    if (t.is_deleted) continue
    const task = buildPalimpsestTask(t, byId)
    if (task === undefined) continue

    events.push(taskCreatedEvent(task))
    // task.completed is a no-op on recurring tasks (projection guard), so skip those.
    // In practice the Todoist Sync API never returns checked=true for a recurring task.
    if (task.status === 'completed' && task.dueDateExpression === undefined) {
      events.push({
        id: newEventId(), type: 'task.completed',
        taskId: task.id, occurredAt: task.completedAt ?? task.updatedAt,
      })
    }
  }

  return events
}

export function buildDeltaEvents(
  current: ProjectionState,
  deltaProjects: SyncProject[],
  deltaItems: SyncItem[],
): PalimpsestEvent[] {
  const events: PalimpsestEvent[] = []

  // Rebuild project map for sphere resolution: stubs from current state + full delta projects.
  // parent_id is set to the sphere container so resolveSphereId can resolve it in one step.
  const allProjects: SyncProject[] = []
  for (const [, p] of current.projects) {
    allProjects.push({
      id: p.id, name: p.name,
      parent_id: p.sphereId === PERSONAL_SPHERE_ID ? TODOIST_PERSONAL_PROJECT_ID : TODOIST_WORK_PROJECT_ID,
      is_inbox_project: false, is_archived: p.isArchived === true,
      is_deleted: false, created_at: p.createdAt, updated_at: p.updatedAt,
    })
  }
  const byId = new Map(allProjects.map(p => [p.id, p]))
  for (const p of deltaProjects) byId.set(p.id, p)

  for (const p of deltaProjects) {
    if (p.is_deleted) {
      if (current.projects.has(p.id as ProjectId)) {
        events.push({ id: newEventId(), type: 'project.archived', projectId: p.id as ProjectId, occurredAt: p.updated_at })
      }
      continue
    }
    if (EXCLUDED_PROJECT_IDS.has(p.id)) continue
    const sphereId = resolveSphereId(p, byId)
    if (sphereId === undefined) continue
    const projectId = p.id as ProjectId

    if (current.projects.has(projectId)) {
      events.push({
        id: newEventId(), type: 'project.updated',
        projectId, patch: { name: p.name, sphereId },
        occurredAt: p.updated_at,
      })
      const existing = current.projects.get(projectId)
      if (p.is_archived && existing?.isArchived !== true) {
        events.push({ id: newEventId(), type: 'project.archived', projectId, occurredAt: p.updated_at })
      } else if (!p.is_archived && existing?.isArchived === true) {
        events.push({ id: newEventId(), type: 'project.unarchived', projectId, occurredAt: p.updated_at })
      }
    } else {
      events.push({
        id: newEventId(), type: 'project.created',
        projectId, sphereId, name: p.name, occurredAt: p.created_at,
      })
      if (p.is_archived) {
        events.push({ id: newEventId(), type: 'project.archived', projectId, occurredAt: p.updated_at })
      }
    }
  }

  for (const t of deltaItems) {
    const taskId = t.id as TaskId
    if (t.is_deleted) {
      if (current.tasks.has(taskId)) {
        events.push({ id: newEventId(), type: 'task.deleted', taskId, occurredAt: t.updated_at })
      }
      continue
    }
    const task = buildPalimpsestTask(t, byId)
    if (task === undefined) continue

    const existing = current.tasks.get(taskId)

    if (existing === undefined) {
      events.push(taskCreatedEvent(task))
      if (task.status === 'completed' && task.dueDateExpression === undefined) {
        events.push({ id: newEventId(), type: 'task.completed', taskId, occurredAt: task.completedAt ?? task.updatedAt })
      }
    } else {
      const patch = taskUpdatedPatch(existing, task)
      if (Object.keys(patch).length > 0) {
        events.push({ id: newEventId(), type: 'task.updated', taskId, occurredAt: task.updatedAt, patch })
      }
      const wasCompleted = existing.status === 'completed'
      const isCompleted  = task.status === 'completed'
      if (isCompleted && !wasCompleted && task.dueDateExpression === undefined) {
        events.push({ id: newEventId(), type: 'task.completed', taskId, occurredAt: task.completedAt ?? task.updatedAt })
      } else if (!isCompleted && wasCompleted) {
        events.push({ id: newEventId(), type: 'task.uncompleted', taskId, occurredAt: task.updatedAt })
      }
    }
  }

  return events
}
