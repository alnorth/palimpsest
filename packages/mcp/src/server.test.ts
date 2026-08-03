import { describe, test, expect, beforeEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ProjectionState } from 'palimpsest'
import { makeSphere, makeTask, buildState } from './testFixtures.js'
import type { TaskStore } from './tools.js'
import { createMcpServer } from './server.js'

function fakeStore(state: ProjectionState): TaskStore {
  return {
    sync: async () => {},
    getState: async () => state,
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

  test('registers all six read-only tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual(
      ['agendas', 'contexts', 'projects', 'spheres', 'task', 'tasks'].sort(),
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
})
