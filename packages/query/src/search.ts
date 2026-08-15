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

// A fresh MiniSearch index is built on every call rather than cached — mirroring the rest of this
// package (and core/query.ts underneath it), which is entirely stateless and recomputes from
// ProjectionState each time. Task/project counts here are small (a personal task manager, not a
// search engine corpus), so the rebuild cost is negligible next to the win of never going stale.
export function searchAll(state: ProjectionState, query: string, opts: SearchOptions = {}): SearchResultJson[] {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const tasks = listTasks(state, {
    status: 'open',
    ...(opts.sphereId !== undefined && { sphereId: opts.sphereId }),
    ...(opts.includeArchived === true && { showArchivedProjects: true }),
  })
  const projects = listProjects(state, {
    ...(opts.sphereId !== undefined && { sphereId: opts.sphereId }),
    ...(opts.includeArchived !== true && { isArchived: false }),
  })
  if (tasks.length === 0 && projects.length === 0) return []

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

  const tasksById = new Map(tasks.map(t => [t.id, t]))
  const projectsById = new Map(projects.map(p => [p.id, p]))
  const stats = computeProjectStats(state)

  const results: SearchResultJson[] = []
  for (const hit of miniSearch.search(trimmed)) {
    const entityKind = hit['entityKind'] as 'task' | 'project'
    const entityId = hit['entityId'] as string
    if (entityKind === 'task') {
      const task = tasksById.get(entityId as TaskId)
      if (task === undefined) continue
      results.push({ kind: 'task', score: hit.score, task: toTaskJson(state, task) })
    } else {
      const project = projectsById.get(entityId as ProjectId)
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
