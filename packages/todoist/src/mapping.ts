import type { AgendaId, ContextId, SphereId, ProjectId, TaskId } from '@alnorth/palimpsest'

// ── Todoist project IDs (hardcoded to this account's layout) ─────────────────

export const TODOIST_WORK_PROJECT_ID     = '6JJ9prC5CQMwjRP4'
export const TODOIST_PERSONAL_PROJECT_ID = '6JJ9pvH6X4H35Rq2'
export const TODOIST_RECURRING_ID        = '6JJ5PvJx7pc93HPH'
export const TODOIST_FUTURE_LOG_ID       = '6JJ7c73HP5f48cJC'
export const TODOIST_INBOX_ID            = '6JHvGw2XGX8wPQR5'
export const TODOIST_AGENDAS_ID          = '6JJC6Cc598MJgVvV'
export const TODOIST_WORK_ONEOFFS_ID     = '6JJ5W472RVPP7rWq'
export const TODOIST_PERSONAL_ONEOFFS_ID = '6JJC253MM396Gj4G'

// ── Sphere IDs (match PALIMPSEST_CONFIG) ─────────────────────────────────────

export const WORK_SPHERE_ID:     SphereId = 'vialibri' as SphereId
export const PERSONAL_SPHERE_ID: SphereId = 'personal' as SphereId

// Projects whose tasks are free-floating (no palimpsest projectId)
export const FREE_FLOATING_PROJECT_IDS = new Set([
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
  TODOIST_INBOX_ID,
])

// ── Agenda-specific projects ──────────────────────────────────────────────────
// The dashboard app gives some agendas (people.jsx's `agendaProjectId`) their own dedicated
// Todoist project, nested under TODOIST_AGENDAS_ID, as an alternative to the @<agenda> label —
// dashboard's Agendas.jsx treats "lives in this project" as equivalent to "carries this agenda's
// label" (its "Criteria 2"). Tasks living directly in one of these projects have no real
// palimpsest project of their own: they resolve to a project-less Task with sphereId set directly
// and agendaId inferred from the project, exactly as if they carried the agenda's label instead.
// Every entry here is therefore also excluded from ever becoming a palimpsest Project (see
// EXCLUDED_PROJECT_IDS below) — these are containers, not real projects.
export interface AgendaProjectInfo {
  agendaId: AgendaId
  sphereId: SphereId
}

export const AGENDA_PROJECT_IDS: Readonly<Record<string, AgendaProjectInfo>> = {
  '6JJC6Fjjgx3gvhQ5': { agendaId: 'agenda-jim'      as AgendaId, sphereId: WORK_SPHERE_ID },
  '6JJC6Hc8GQQCPJqQ': { agendaId: 'agenda-marcia'   as AgendaId, sphereId: WORK_SPHERE_ID },
  '6JJC6H29RVmq9vc6': { agendaId: 'agenda-nicolas'  as AgendaId, sphereId: WORK_SPHERE_ID },
  '6JJC6HJHq486R6vW': { agendaId: 'agenda-anton'    as AgendaId, sphereId: WORK_SPHERE_ID },
  '6JJCCfg4HHQ9gv9F': { agendaId: 'agenda-dev'      as AgendaId, sphereId: WORK_SPHERE_ID },
  '6cqhxvmJjm5C3H59': { agendaId: 'agenda-showcase' as AgendaId, sphereId: WORK_SPHERE_ID },
  '6g69qcgGG4gJjrHG': { agendaId: 'agenda-tab'      as AgendaId, sphereId: WORK_SPHERE_ID },
  '6XpxJRR98r7QfGp7': { agendaId: 'agenda-devoteam' as AgendaId, sphereId: WORK_SPHERE_ID },
  '6JJC6GcphmrwhxFF': { agendaId: 'agenda-han'      as AgendaId, sphereId: PERSONAL_SPHERE_ID },
  '6MrcP7QXgXJh2Wfx': { agendaId: 'agenda-dad'      as AgendaId, sphereId: PERSONAL_SPHERE_ID },
  '6X5w4vgPjh6v6Xwr': { agendaId: 'agenda-scouts'   as AgendaId, sphereId: PERSONAL_SPHERE_ID },
  '6hGv5357hCwmGR9R': { agendaId: 'agenda-inspire'  as AgendaId, sphereId: PERSONAL_SPHERE_ID },
}

// Reverse lookup: agenda id -> its dedicated Todoist project id (test/caller convenience,
// mirroring AGENDA_ID_TO_LABEL's relationship to LABEL_TO_AGENDA_ID).
export const AGENDA_ID_TO_AGENDA_PROJECT_ID: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(AGENDA_PROJECT_IDS).map(([projectId, info]) => [info.agendaId, projectId]),
)

// Projects that are excluded from becoming palimpsest projects entirely
// (sphere containers, meta-projects, agenda containers)
export const EXCLUDED_PROJECT_IDS = new Set([
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
  TODOIST_INBOX_ID,
  TODOIST_AGENDAS_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  ...Object.keys(AGENDA_PROJECT_IDS),
])

// ── Label → palimpsest ID mappings ───────────────────────────────────────────

export const LABEL_TO_AGENDA_ID: Readonly<Record<string, AgendaId>> = {
  jim:      'agenda-jim'      as AgendaId,
  marcia:   'agenda-marcia'   as AgendaId,
  nicolas:  'agenda-nicolas'  as AgendaId,
  anton:    'agenda-anton'    as AgendaId,
  dev:      'agenda-dev'      as AgendaId,
  showcase: 'agenda-showcase' as AgendaId,
  tab:      'agenda-tab'      as AgendaId,
  devoteam: 'agenda-devoteam' as AgendaId,
  han:      'agenda-han'      as AgendaId,
  dad:      'agenda-dad'      as AgendaId,
  scouts:   'agenda-scouts'   as AgendaId,
  inspire:  'agenda-inspire'  as AgendaId,
}

export const LABEL_TO_CONTEXT_ID: Readonly<Record<string, ContextId>> = {
  marketing:   'ctx-marketing'   as ContextId,
  accounting:  'ctx-accounting'  as ContextId,
  strategic:   'ctx-strategic'   as ContextId,
  quick:       'ctx-quick'       as ContextId,
  email:       'ctx-email'       as ContextId,
  anytime:     'ctx-anytime'     as ContextId,
  phone:       'ctx-phone'       as ContextId,
  laptop:      'ctx-laptop'      as ContextId,
  tools:       'ctx-tools'       as ContextId,
  sewing:      'ctx-sewing'      as ContextId,
  notools:     'ctx-no-tools'    as ContextId,
  loft:        'ctx-loft'        as ContextId,
  errands:     'ctx-errands'     as ContextId,
  daytime:     'ctx-daytime'     as ContextId,
  gaming:      'ctx-gaming'      as ContextId,
  weekdaytime: 'ctx-weekdaytime' as ContextId,
  deepthought: 'ctx-deepthought' as ContextId,
}

// Reverse maps for write path
export const AGENDA_ID_TO_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LABEL_TO_AGENDA_ID).map(([label, id]) => [id, label])
)

export const CONTEXT_ID_TO_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LABEL_TO_CONTEXT_ID).map(([label, id]) => [id, label])
)

// Sphere label used in Recurring / Future log / Inbox tasks
export function sphereLabelFor(sphereId: SphereId): string {
  return sphereId === PERSONAL_SPHERE_ID ? 'personal' : 'work'
}

// Marker label for a project-less, dated task whose sphere couldn't be resolved (see
// freeFloatingProjectFor) — parked in Inbox rather than a sphere-specific bucket. Lets the read
// path (resolveSphereFromTask) tell this apart from a genuinely captured, never-triaged Inbox
// task, so it stays sphere-less on the way back in instead of silently defaulting to Work.
export const UNSPHERED_LABEL = 'unsphered'

// Todoist One Offs project for a sphere (where free-floating tasks live)
export function oneOffsProjectFor(sphereId: SphereId): string {
  return sphereId === PERSONAL_SPHERE_ID ? TODOIST_PERSONAL_ONEOFFS_ID : TODOIST_WORK_ONEOFFS_ID
}

// Todoist container project for a new free-floating task, based on sphere and due date state.
// Recurring > Future Log > One-Offs (sphere-specific) — but a dated task with no sphere (e.g. a
// quick-captured Inbox task never triaged into a sphere) stays in Inbox rather than guessing a
// sphere just to bucket it: Future Log/Recurring are sphere-specific views, so a task that hasn't
// been assigned a sphere yet doesn't belong in either.
export function freeFloatingProjectFor(
  sphereId: SphereId | undefined,
  opts: { dueDate?: string; dueDateExpression?: string },
): string {
  const hasDueState = opts.dueDateExpression !== undefined || opts.dueDate !== undefined
  if (sphereId === undefined && hasDueState) return TODOIST_INBOX_ID
  if (opts.dueDateExpression !== undefined)  return TODOIST_RECURRING_ID
  if (opts.dueDate !== undefined)            return TODOIST_FUTURE_LOG_ID
  return oneOffsProjectFor(sphereId ?? WORK_SPHERE_ID)
}

// Todoist container project for a project-less task, mirroring the read path's own priority:
// AGENDA_PROJECT_IDS is checked before the due-date-bucketed free-floating containers there (see
// resolveSphereFromTask/buildPalimpsestTask in read.ts), so a task carrying an agendaId with no
// real project belongs in that agenda's dedicated project — not merely labelled while it sits in
// Recurring/Future Log/One-Offs — the same way a task living there is read back with that agendaId
// with no label needed at all. `viaAgendaProject` reports which branch of that priority was taken,
// so callers (deriveTodoistShape's agenda-label suppression) don't have to re-derive the same fact
// via a separate equality check that could drift out of sync with this priority order.
export interface ProjectlessContainer {
  id: string
  viaAgendaProject: boolean
}

export function projectlessContainerFor(
  sphereId: SphereId | undefined,
  agendaId: AgendaId | undefined,
  opts: { dueDate?: string; dueDateExpression?: string },
): ProjectlessContainer {
  const agendaProjectId = agendaId !== undefined ? AGENDA_ID_TO_AGENDA_PROJECT_ID[agendaId] : undefined
  if (agendaProjectId !== undefined) return { id: agendaProjectId, viaAgendaProject: true }
  return { id: freeFloatingProjectFor(sphereId, opts), viaAgendaProject: false }
}

// Todoist parent project for new projects in a sphere
export function sphereParentProjectFor(sphereId: SphereId): string {
  return sphereId === PERSONAL_SPHERE_ID ? TODOIST_PERSONAL_PROJECT_ID : TODOIST_WORK_PROJECT_ID
}

// Todoist URL for a project (used in waitingFor.project descriptions)
export function todoistProjectUrl(projectId: ProjectId): string {
  return `https://todoist.com/app/project/${projectId}`
}

// Todoist URL for a task (view-on-the-web link — Task.id is the Todoist item id verbatim)
export function todoistTaskUrl(taskId: TaskId): string {
  return `https://todoist.com/app/task/${taskId}`
}

// Extract a Todoist project ID from a project URL in a task description
export function extractProjectIdFromUrl(description: string): ProjectId | undefined {
  const m = description.match(/todoist\.com\/app\/project\/([A-Za-z0-9]+)/)
  return m?.[1] !== undefined ? (m[1] as ProjectId) : undefined
}
