import type { ProjectionState, Task, Project, Context, WaitingFor, SphereId, AgendaId } from '@alnorth/palimpsest'
import { listTasks, listProjects, listContexts } from '@alnorth/palimpsest'
import { computeProjectNextTasks } from './serialize'

export function dashboardTasks(state: ProjectionState, sphereId: SphereId, today: string): Task[] {
  const allOpen = listTasks(state, { status: 'open', sphereId })
  const result = allOpen.filter(t => (t.dueDate !== undefined && t.dueDate <= today) || t.isStarred === true)
  result.sort((a, b) => {
    const aDue = a.dueDate !== undefined && a.dueDate <= today
    const bDue = b.dueDate !== undefined && b.dueDate <= today
    if (aDue && bDue) return a.dueDate!.localeCompare(b.dueDate!)
    if (aDue) return -1
    if (bDue) return 1
    return 0
  })
  return result
}

export interface ProcessingBuckets {
  actionableTasks: Task[]
  projectsWithoutNext: Project[]
  tasksWaitingOnArchivedProjects: Task[]
}

export function processingBuckets(state: ProjectionState): ProcessingBuckets {
  const actionableTasks = listTasks(state, {
    isActionable: true, isWaiting: false, hasDueDate: false, hasAgenda: false, hasContext: false,
  })

  const nextTasksByProject = computeProjectNextTasks(state)
  const projectsWithoutNext = listProjects(state, { isArchived: false }).filter(p => !nextTasksByProject.has(p.id))

  const tasksWaitingOnArchivedProjects = listTasks(state, { status: 'open', isWaiting: true }).filter(t => {
    if (t.waitingFor?.kind !== 'project') return false
    const project = state.projects.get(t.waitingFor.projectId)
    return project === undefined || project.isArchived === true
  })

  return { actionableTasks, projectsWithoutNext, tasksWaitingOnArchivedProjects }
}

const WAITING_KIND_ORDER: WaitingFor['kind'][] = ['review', 'agenda', 'project', 'trello']

export interface WaitingGroup {
  kind: WaitingFor['kind']
  tasks: Task[]
}

export function waitingGroups(state: ProjectionState, sphereId?: SphereId): WaitingGroup[] {
  const waitingTasks = listTasks(state, {
    status: 'open', isWaiting: true, ...(sphereId !== undefined && { sphereId }),
  })
  return WAITING_KIND_ORDER.flatMap(kind => {
    const tasks = waitingTasks.filter(t => t.waitingFor?.kind === kind)
    return tasks.length > 0 ? [{ kind, tasks }] : []
  })
}

export interface PickListGroup {
  context: Context
  tasks: Task[]
}

export function pickListGroups(state: ProjectionState, sphereId: SphereId): PickListGroup[] {
  const eligible = listTasks(state, { sphereId, isActionable: true, hasContext: true })

  const byContext = new Map<Context['id'], Task[]>()
  for (const task of eligible) {
    const key = task.contextId!
    const bucket = byContext.get(key)
    if (bucket !== undefined) bucket.push(task)
    else byContext.set(key, [task])
  }

  const groups: PickListGroup[] = []
  for (const context of listContexts(state, { sphereId })) {
    const bucket = byContext.get(context.id)
    if (bucket !== undefined && bucket.length > 0) groups.push({ context, tasks: bucket })
  }
  return groups
}

export interface AgendaViewResult {
  waitingTasks: Task[]
  activeTasks: Task[]
  projects: Project[]
}

export function agendaView(state: ProjectionState, agendaId: AgendaId, today: string): AgendaViewResult {
  // isActionable already matches dashboard's two criteria for "relevant to this agenda", generalized:
  // status 'open' && (no real project [covers both explicitly labelled and dedicated-project-derived
  // free-floating tasks] || isNext).
  const eligible = listTasks(state, { agendaId, isActionable: true })
    .filter(t => t.dueDate === undefined || t.dueDate <= today)

  return {
    waitingTasks: eligible.filter(t => t.waitingFor !== undefined),
    activeTasks: eligible.filter(t => t.waitingFor === undefined),
    projects: listProjects(state, { agendaId, isArchived: false }),
  }
}
