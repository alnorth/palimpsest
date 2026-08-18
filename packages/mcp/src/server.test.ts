import { describe, test, expect, beforeEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { applyEvent } from '@alnorth/palimpsest'
import { makeSphere, makeAgenda, makeProject, makeContext, makeTask, buildState } from './testFixtures'
import type { TaskStore } from './tools'
import { createMcpServer } from './server'

function fakeStore(state: ProjectionState): TaskStore {
  return {
    sync: async () => {},
    getState: async () => state,
    appendEvents: async (events: PalimpsestEvent[]) => {
      for (const event of events) applyEvent(state, event)
    },
  }
}

async function connectedClient(store: TaskStore): Promise<Client> {
  const server = createMcpServer(store)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return client
}

type CallToolReturn = Awaited<ReturnType<Client['callTool']>>

function firstText(result: CallToolReturn): string {
  const content = (result as { content?: unknown[] }).content
  if (content === undefined) throw new Error('Expected a content-bearing tool result')
  return (content[0] as { type: 'text'; text: string }).text
}

describe('createMcpServer', () => {
  let client: Client

  beforeEach(async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it', isStarred: true })
    client = await connectedClient(fakeStore(buildState({ spheres: [sphere], tasks: [task] })))
  })

  test('registers all sixteen tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual(
      [
        'agendas', 'contexts', 'projects', 'spheres', 'task', 'tasks',
        'dashboard', 'processing', 'waiting', 'pick_list', 'search', 'agenda_view',
        'complete_task', 'set_due_date', 'delete_task', 'set_project_agenda',
      ].sort(),
    )
  })

  test('tasks tool applies filters and returns the JSON envelope', async () => {
    const result = await client.callTool({ name: 'tasks', arguments: { starred: true } })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { ok: boolean; tasks: { title: string }[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.tasks.map(t => t.title)).toEqual(['Ship it'])
  })

  test('spheres tool takes no arguments', async () => {
    const result = await client.callTool({ name: 'spheres', arguments: {} })
    const parsed = JSON.parse(firstText(result)) as { spheres: { name: string }[] }
    expect(parsed.spheres.map(s => s.name)).toEqual(['Work'])
  })

  test('task tool surfaces an unknown id as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'task', arguments: { id: 'missing' } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/No task with id "missing"/)
  })

  test('rejects a negative limit before the handler runs', async () => {
    const result = await client.callTool({ name: 'tasks', arguments: { limit: -1 } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Invalid arguments/)
  })

  test('tasks tool accepts hasContext to reconstruct a pick-list-style query', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const context = makeContext(sphere, { name: '@errand' })
    const withContext = makeTask({ sphereId: sphere.id, contextId: context.id, title: 'HasContext' })
    const withoutContext = makeTask({ sphereId: sphere.id, title: 'NoContext' })
    const scopedClient = await connectedClient(fakeStore(buildState({
      spheres: [sphere], contexts: [context], tasks: [withContext, withoutContext],
    })))

    const result = await scopedClient.callTool({ name: 'tasks', arguments: { hasContext: true } })

    const parsed = JSON.parse(firstText(result)) as { tasks: { title: string }[] }
    expect(parsed.tasks.map(t => t.title)).toEqual(['HasContext'])
  })

  test('search tool matches a task by a partial word and returns the JSON envelope', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'Ship' } })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { ok: boolean; results: { kind: string; task?: { title: string } }[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.results.map(r => r.task?.title)).toEqual(['Ship it'])
  })

  test('search tool requires a query argument', async () => {
    const result = await client.callTool({ name: 'search', arguments: {} })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Invalid arguments/)
  })

  test('agenda_view tool returns the agenda plus waiting/active tasks and linked projects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const project = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const task = makeTask({ sphereId: sphere.id, title: 'TalkToHan', agendaId: agenda.id })
    const scopedClient = await connectedClient(fakeStore(buildState({
      spheres: [sphere], agendas: [agenda], projects: [project], tasks: [task],
    })))

    const result = await scopedClient.callTool({ name: 'agenda_view', arguments: { agenda: 'Han' } })

    const parsed = JSON.parse(firstText(result)) as {
      agenda: { name: string }
      activeTasks: { title: string }[]
      projects: { name: string }[]
    }
    expect(parsed.agenda.name).toBe('Han')
    expect(parsed.activeTasks.map(t => t.title)).toEqual(['TalkToHan'])
    expect(parsed.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('agenda_view tool requires an agenda argument', async () => {
    const result = await client.callTool({ name: 'agenda_view', arguments: {} })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Invalid arguments/)
  })

  test('dashboard tool requires a sphere argument', async () => {
    const result = await client.callTool({ name: 'dashboard', arguments: {} })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Invalid arguments/)
  })

  test('dashboard tool returns starred/due tasks for the given sphere', async () => {
    const result = await client.callTool({ name: 'dashboard', arguments: { sphere: 'Work' } })
    const parsed = JSON.parse(firstText(result)) as { tasks: { title: string }[] }
    expect(parsed.tasks.map(t => t.title)).toEqual(['Ship it'])
  })

  test('processing tool takes no arguments', async () => {
    const result = await client.callTool({ name: 'processing', arguments: {} })
    const parsed = JSON.parse(firstText(result)) as { actionableTasks: unknown[] }
    expect(Array.isArray(parsed.actionableTasks)).toBe(true)
  })

  test('waiting tool groups by kind and does not require a sphere', async () => {
    const result = await client.callTool({ name: 'waiting', arguments: {} })
    const parsed = JSON.parse(firstText(result)) as { groups: unknown[] }
    expect(Array.isArray(parsed.groups)).toBe(true)
  })

  test('pick_list tool requires a sphere argument', async () => {
    const result = await client.callTool({ name: 'pick_list', arguments: {} })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Invalid arguments/)
  })

  test('complete_task tool completes a task by id and returns the updated task', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk', status: 'open' })
    const scopedClient = await connectedClient(fakeStore(buildState({ spheres: [sphere], tasks: [task] })))

    const result = await scopedClient.callTool({ name: 'complete_task', arguments: { id: task.id } })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { task: { title: string; status: string } }
    expect(parsed.task).toEqual(expect.objectContaining({ title: 'Buy milk', status: 'completed' }))
  })

  test('complete_task tool surfaces an unknown id as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'complete_task', arguments: { id: 'missing' } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Task not found: missing/)
  })

  test('set_due_date tool sets a due date on a task by id and returns the updated task', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk', status: 'open' })
    const scopedClient = await connectedClient(fakeStore(buildState({ spheres: [sphere], tasks: [task] })))

    const result = await scopedClient.callTool({
      name: 'set_due_date', arguments: { id: task.id, dueDate: '2026-08-15' },
    })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { task: { title: string; dueDate: string } }
    expect(parsed.task).toEqual(expect.objectContaining({ title: 'Buy milk', dueDate: '2026-08-15' }))
  })

  test('set_due_date tool clears a due date when dueDate is null', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk', status: 'open', dueDate: '2026-01-01' })
    const scopedClient = await connectedClient(fakeStore(buildState({ spheres: [sphere], tasks: [task] })))

    const result = await scopedClient.callTool({ name: 'set_due_date', arguments: { id: task.id, dueDate: null } })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { task: { dueDate: string | null } }
    expect(parsed.task.dueDate).toBeNull()
  })

  test('set_due_date tool surfaces an unknown id as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'set_due_date', arguments: { id: 'missing', dueDate: '2026-08-15' } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Task not found: missing/)
  })

  test('delete_task tool deletes a task by id and returns the updated task', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk', status: 'open' })
    const scopedClient = await connectedClient(fakeStore(buildState({ spheres: [sphere], tasks: [task] })))

    const result = await scopedClient.callTool({ name: 'delete_task', arguments: { id: task.id } })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { task: { title: string; status: string } }
    expect(parsed.task).toEqual(expect.objectContaining({ title: 'Buy milk', status: 'deleted' }))
  })

  test('delete_task tool surfaces an unknown id as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'delete_task', arguments: { id: 'missing' } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Task not found: missing/)
  })

  test('projects tool accepts agenda/hasAgenda/withoutAgenda filters', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const scopedClient = await connectedClient(fakeStore(buildState({
      spheres: [sphere], agendas: [agenda], projects: [linked, unlinked],
    })))

    const result = await scopedClient.callTool({ name: 'projects', arguments: { agenda: 'Jim' } })

    const parsed = JSON.parse(firstText(result)) as { projects: { name: string }[] }
    expect(parsed.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('set_project_agenda tool links a project to an agenda and returns the updated project', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere, { name: 'Website' })
    const scopedClient = await connectedClient(fakeStore(buildState({
      spheres: [sphere], agendas: [agenda], projects: [project],
    })))

    const result = await scopedClient.callTool({
      name: 'set_project_agenda', arguments: { id: project.id, agendaId: agenda.id },
    })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { project: { name: string; agenda: { name: string } | null } }
    expect(parsed.project).toEqual(expect.objectContaining({ name: 'Website', agenda: { id: agenda.id, name: 'Jim' } }))
  })

  test('set_project_agenda tool clears the agenda link when agendaId is null', async () => {
    const sphere = makeSphere({ name: 'Errands' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere, { agendaId: agenda.id })
    const scopedClient = await connectedClient(fakeStore(buildState({
      spheres: [sphere], agendas: [agenda], projects: [project],
    })))

    const result = await scopedClient.callTool({
      name: 'set_project_agenda', arguments: { id: project.id, agendaId: null },
    })

    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(firstText(result)) as { project: { agenda: unknown } }
    expect(parsed.project.agenda).toBeNull()
  })

  test('set_project_agenda tool surfaces an unknown id as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'set_project_agenda', arguments: { id: 'missing', agendaId: null } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toMatch(/Project not found: missing/)
  })
})
