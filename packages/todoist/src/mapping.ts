import type { AgendaId, ContextId, SphereId, ProjectId } from 'palimpsest'

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
  home:        'ctx-home'        as ContextId,
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

// Todoist One Offs project for a sphere (where free-floating tasks live)
export function oneOffsProjectFor(sphereId: SphereId): string {
  return sphereId === PERSONAL_SPHERE_ID ? TODOIST_PERSONAL_ONEOFFS_ID : TODOIST_WORK_ONEOFFS_ID
}

// Todoist parent project for new projects in a sphere
export function sphereParentProjectFor(sphereId: SphereId): string {
  return sphereId === PERSONAL_SPHERE_ID ? TODOIST_PERSONAL_PROJECT_ID : TODOIST_WORK_PROJECT_ID
}

// Strip Todoist's "fixed schedule" modifier — not part of palimpsest's expression syntax
export function normaliseDueString(s: string): string {
  return s.replace(/!/g, '').replace(/\s+/g, ' ').trim()
}

// Todoist URL for a project (used in waitingFor.project descriptions)
export function todoistProjectUrl(projectId: ProjectId): string {
  return `https://todoist.com/app/project/${projectId}`
}

// Extract a Todoist project ID from a project URL in a task description
export function extractProjectIdFromUrl(description: string): ProjectId | undefined {
  const m = description.match(/todoist\.com\/app\/project\/([A-Za-z0-9]+)/)
  return m?.[1] !== undefined ? (m[1] as ProjectId) : undefined
}
