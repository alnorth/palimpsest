import type { AgendaId } from '@alnorth/palimpsest'
import type { SyncItem } from './api'
import { LABEL_TO_AGENDA_ID, AGENDA_ID_TO_LABEL } from './mapping'

// This is the exact magic task content, storage location, and fenced-JSON format the
// /home/user/dashboard app already uses (useTodoistStorage.jsx + useSharedProjectMapping.jsx) to map
// Todoist projects to people. Reusing it verbatim — rather than inventing a palimpsest-specific
// scheme — lets both apps read and write the same live Todoist data interchangeably.
export const AGENDA_PROJECT_MAP_TASK_TITLE = '* _AGENDA_PROJECT_MAPPING_'

// Dashboard's people.jsx sentinel meaning "no agenda — this project is just mine," as opposed to a
// project that was never run through the sharing UI at all. Resolved into Project.isSelfOnly (see
// resolveProjectSharing below), distinct from an unset agendaId.
export const SELF_AGENDA_LABEL = 'me'

// Every hidden storage task the dashboard's useTodoistStorage.jsx mechanism creates (in Inbox, via
// onAddTask), verified against the dashboard's actual source — not just the one this package parses
// values out of. Without this, any of the other five leak into palimpsest as real, visible,
// free-floating tasks (their fenced-JSON blobs as descriptions) in every task list/search result.
export const DASHBOARD_STORAGE_TASK_TITLES: ReadonlySet<string> = new Set([
  AGENDA_PROJECT_MAP_TASK_TITLE,   // useSharedProjectMapping.jsx
  '* _GITHUB_PR_DATA_',            // Contexts/GithubContext.jsx
  '* _STARRED_ITEMS_',             // Components/WorkDashboard.jsx
  '* _PROJECT_OVERVIEW_MAPPING_',  // Components/ProjectOverview.jsx
  '* _DAILY_BASICS_DATA_',         // Components/Basics.jsx
  '* _DAILY_CHECKLIST_DATA_',      // Components/DailyChecklist.jsx
])

const FENCE_PREFIX = '```\n'
const FENCE_SUFFIX = '\n```'

export function findAgendaMapTask(rawItems: SyncItem[]): SyncItem | undefined {
  return rawItems.find(t => !t.is_deleted && t.content === AGENDA_PROJECT_MAP_TASK_TITLE)
}

// Raw, untranslated mapping (Todoist project id -> label string) — tolerant of missing/malformed
// JSON, mirroring the dashboard's own try/catch-fallback-to-initialValue.
export function parseAgendaMapping(item: SyncItem | undefined): Record<string, string> {
  if (item === undefined) return {}
  try {
    const body = item.description.startsWith(FENCE_PREFIX) && item.description.endsWith(FENCE_SUFFIX)
      ? item.description.slice(FENCE_PREFIX.length, item.description.length - FENCE_SUFFIX.length)
      : item.description
    const parsed: unknown = JSON.parse(body)
    return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

export function serializeAgendaMapping(mapping: Record<string, string>): string {
  return FENCE_PREFIX + JSON.stringify(mapping, null, 2) + FENCE_SUFFIX
}

export interface ProjectSharingResolution {
  agendaIds: Record<string, AgendaId>
  selfOnlyProjectIds: Set<string>
}

// Translate raw label-keyed mapping into both outcomes a project's label can resolve to.
// SELF_AGENDA_LABEL ("me") is tracked as its own outcome (-> Project.isSelfOnly), not dropped or
// conflated with a genuinely unrecognized label (bad data, not a known sentinel) — those are
// dropped from both outcomes the same way they always have been.
export function resolveProjectSharing(raw: Record<string, string>): ProjectSharingResolution {
  const agendaIds: Record<string, AgendaId> = {}
  const selfOnlyProjectIds = new Set<string>()
  for (const [projectId, label] of Object.entries(raw)) {
    if (label === SELF_AGENDA_LABEL) { selfOnlyProjectIds.add(projectId); continue }
    const agendaId = LABEL_TO_AGENDA_ID[label]
    if (agendaId !== undefined) agendaIds[projectId] = agendaId
  }
  return { agendaIds, selfOnlyProjectIds }
}

// Write-side inverse of one entry. Throws (rather than silently no-op) if the agenda has no
// Todoist label — unlike computeLabels' silent skip (additive, harmless), a write's whole job is
// to persist this link, so silently doing nothing would misreport success.
export function labelForAgenda(agendaId: AgendaId): string {
  const label = AGENDA_ID_TO_LABEL[agendaId]
  if (label === undefined) throw new Error(`No Todoist label mapped for agenda: ${agendaId}`)
  return label
}
