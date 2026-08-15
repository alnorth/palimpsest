import MiniSearch from 'minisearch'
import type { ProjectionState, SphereId, TaskId, ProjectId } from '@alnorth/palimpsest'
import { listTasks, listProjects } from '@alnorth/palimpsest'
import { toTaskJson, toProjectJson, computeProjectStats } from './serialize'
import type { TaskJson, ProjectJson } from './serialize'

export interface SearchOptions {
  sphereId?: SphereId
  includeArchived?: boolean
}

export type SearchResultJson =
  | { kind: 'task'; score: number; task: TaskJson }
  | { kind: 'project'; score: number; project: ProjectJson }

interface SearchDoc {
  id: string
  entityKind: 'task' | 'project'
  entityId: string
  title: string
  description: string
}

// Building the MiniSearch index (tokenizing every task/project title+description) is the one
// genuinely expensive step here — unlike the rest of this stateless package, it's worth caching.
// `store.getState()` (see core/store.ts's PalimpsestStore) always re-projects the whole event log
// into a brand-new ProjectionState object, so a WeakMap keyed on that object never hits across
// separate store reads (e.g. two different MCP tool calls) — no harm, just no help there. But
// packages/hooks' PalimpsestProvider only calls getState() again when the store actually notifies
// of a change; the same ProjectionState reference is reused across every re-render in between
// (e.g. every keystroke of a find-as-you-type search box), so caching by that reference is exactly
// the "only rebuild when the store changes" behaviour callers want. The nested map also keys on
// sphere/includeArchived, since those change which docs get indexed.
const indexCache = new WeakMap<ProjectionState, Map<string, MiniSearch<SearchDoc> | null>>()

function scopeKey(opts: SearchOptions): string {
  return `${opts.sphereId ?? ''}|${opts.includeArchived === true}`
}

function getOrBuildIndex(state: ProjectionState, opts: SearchOptions): MiniSearch<SearchDoc> | undefined {
  let scoped = indexCache.get(state)
  if (scoped === undefined) {
    scoped = new Map()
    indexCache.set(state, scoped)
  }

  const key = scopeKey(opts)
  if (scoped.has(key)) return scoped.get(key) ?? undefined

  const tasks = listTasks(state, {
    status: 'open',
    ...(opts.sphereId !== undefined && { sphereId: opts.sphereId }),
    ...(opts.includeArchived === true && { showArchivedProjects: true }),
  })
  const projects = listProjects(state, {
    ...(opts.sphereId !== undefined && { sphereId: opts.sphereId }),
    ...(opts.includeArchived !== true && { isArchived: false }),
  })

  if (tasks.length === 0 && projects.length === 0) {
    scoped.set(key, null)
    return undefined
  }

  const docs: SearchDoc[] = [
    ...tasks.map((t): SearchDoc => ({ id: `task:${t.id}`, entityKind: 'task', entityId: t.id, title: t.title, description: t.description })),
    ...projects.map((p): SearchDoc => ({ id: `project:${p.id}`, entityKind: 'project', entityId: p.id, title: p.name, description: p.description ?? '' })),
  ]

  const miniSearch = new MiniSearch<SearchDoc>({
    idField: 'id',
    fields: ['title', 'description'],
    storeFields: ['entityKind', 'entityId'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } },
  })
  miniSearch.addAll(docs)
  scoped.set(key, miniSearch)
  return miniSearch
}

export function searchAll(state: ProjectionState, query: string, opts: SearchOptions = {}): SearchResultJson[] {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const miniSearch = getOrBuildIndex(state, opts)
  if (miniSearch === undefined) return []

  const stats = computeProjectStats(state)

  const results: SearchResultJson[] = []
  for (const hit of miniSearch.search(trimmed)) {
    const entityKind = hit['entityKind'] as 'task' | 'project'
    const entityId = hit['entityId'] as string
    if (entityKind === 'task') {
      const task = state.tasks.get(entityId as TaskId)
      if (task === undefined) continue
      results.push({ kind: 'task', score: hit.score, task: toTaskJson(state, task) })
    } else {
      const project = state.projects.get(entityId as ProjectId)
      if (project === undefined) continue
      results.push({
        kind: 'project',
        score: hit.score,
        project: toProjectJson(state, project, stats.get(project.id) ?? { openTaskCount: 0, hasNextAction: false }),
      })
    }
  }
  return results
}
