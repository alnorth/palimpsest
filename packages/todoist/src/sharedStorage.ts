import type { AgendaId } from '@alnorth/palimpsest'
import type { SyncItem } from './api'
import { LABEL_TO_AGENDA_ID, AGENDA_ID_TO_LABEL } from './mapping'

// This is the exact magic task content, storage location, and fenced-JSON format the
// /home/user/dashboard app already uses (useTodoistStorage.jsx + useSharedProjectMapping.jsx) to map
// Todoist projects to people. Reusing it verbatim — rather than inventing a palimpsest-specific
// scheme — lets both apps read and write the same live Todoist data interchangeably.
export const AGENDA_PROJECT_MAP_TASK_TITLE = '* _AGENDA_PROJECT_MAPPING_'

// Dashboard's people.jsx sentinel meaning "no agenda — this project is just mine," as opposed to a
// project that was never run through the sharing UI at all (both currently resolve to no agendaId
// on the palimpsest side, but this is named so that's a deliberate choice, not an accidental drop).
export const SELF_AGENDA_LABEL = 'me'

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

// Translate raw label-keyed mapping -> AgendaId-keyed. SELF_AGENDA_LABEL ("me") is deliberately
// excluded, not just unresolved. Any other label with no LABEL_TO_AGENDA_ID entry is a genuinely
// unrecognized value (bad data, not a known sentinel) and is dropped the same way, but that's a
// fallback for bad input, not the expected path "me" takes.
export function resolveProjectAgendaIds(raw: Record<string, string>): Record<string, AgendaId> {
  const resolved: Record<string, AgendaId> = {}
  for (const [projectId, label] of Object.entries(raw)) {
    if (label === SELF_AGENDA_LABEL) continue
    const agendaId = LABEL_TO_AGENDA_ID[label]
    if (agendaId !== undefined) resolved[projectId] = agendaId
  }
  return resolved
}

// Write-side inverse of one entry. Throws (rather than silently no-op) if the agenda has no
// Todoist label — unlike computeLabels' silent skip (additive, harmless), a write's whole job is
// to persist this link, so silently doing nothing would misreport success.
export function labelForAgenda(agendaId: AgendaId): string {
  const label = AGENDA_ID_TO_LABEL[agendaId]
  if (label === undefined) throw new Error(`No Todoist label mapped for agenda: ${agendaId}`)
  return label
}
