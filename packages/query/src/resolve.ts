import type { ProjectionState, SphereId, ProjectId, AgendaId, ContextId } from 'palimpsest'
import { listSpheres, listProjects, listAgendas, listContexts } from 'palimpsest'

interface Candidate {
  id: string
  name: string
}

function unknownMessage(kind: string, input: string, candidates: Candidate[]): string {
  const names = candidates.map(c => c.name)
  const known = names.length > 0 ? `Known ${kind}s: ${names.join(', ')}.` : `No ${kind}s exist yet.`
  return `No ${kind} matching "${input}". ${known}`
}

function ambiguousMessage(kind: string, input: string, matches: Candidate[]): string {
  const names = matches.map(c => c.name)
  return `Ambiguous ${kind} "${input}" matches multiple: ${names.join(', ')}. Use a more specific name.`
}

function resolve(kind: string, candidates: Candidate[], input: string): string {
  const byId = candidates.find(c => c.id === input)
  if (byId !== undefined) return byId.id

  const lowerInput = input.toLowerCase()

  const exact = candidates.filter(c => c.name.toLowerCase() === lowerInput)
  if (exact.length === 1) {
    const match = exact[0]
    if (match !== undefined) return match.id
  }
  if (exact.length > 1) throw new Error(ambiguousMessage(kind, input, exact))

  const substring = candidates.filter(c => c.name.toLowerCase().includes(lowerInput))
  if (substring.length === 1) {
    const match = substring[0]
    if (match !== undefined) return match.id
  }
  if (substring.length > 1) throw new Error(ambiguousMessage(kind, input, substring))

  throw new Error(unknownMessage(kind, input, candidates))
}

export function resolveSphere(state: ProjectionState, input: string): SphereId {
  const candidates = listSpheres(state).map(s => ({ id: s.id, name: s.name }))
  return resolve('sphere', candidates, input) as SphereId
}

export function resolveProject(state: ProjectionState, input: string, sphereId?: SphereId): ProjectId {
  const projects = listProjects(state, sphereId !== undefined ? { sphereId } : undefined)
  const candidates = projects.map(p => ({ id: p.id, name: p.name }))
  return resolve('project', candidates, input) as ProjectId
}

export function resolveAgenda(state: ProjectionState, input: string, sphereId?: SphereId): AgendaId {
  const agendas = listAgendas(state, sphereId !== undefined ? { sphereId } : undefined)
  const candidates = agendas.map(a => ({ id: a.id, name: a.title }))
  return resolve('agenda', candidates, input) as AgendaId
}

export function resolveContext(state: ProjectionState, input: string, sphereId?: SphereId): ContextId {
  const contexts = listContexts(state, sphereId !== undefined ? { sphereId } : undefined)
  const candidates = contexts.map(c => ({ id: c.id, name: c.name }))
  return resolve('context', candidates, input) as ContextId
}
