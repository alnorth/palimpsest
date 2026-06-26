import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSync } from './handleSync.js'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { createTask } from 'palimpsest'
import type { PalimpsestEvent, SphereId } from 'palimpsest'

// Minimal DynamoDB mock factory — returns an empty store by default
function makeClient(overrides: {
  currentSeq?: number
  storedEvents?: PalimpsestEvent[]
  appendResult?: 'ok' | 'conflict'
} = {}): DynamoDBDocumentClient {
  const { currentSeq = 0, storedEvents = [], appendResult = 'ok' } = overrides

  const sendFn = vi.fn((command: any) => {
    const name = command.constructor.name
    if (name === 'GetCommand') {
      return Promise.resolve({
        Item: currentSeq > 0 ? { nextSeq: currentSeq } : undefined,
      })
    }
    if (name === 'QueryCommand') {
      const fromSK: string | undefined = command.input.ExpressionAttributeValues?.[':fromSK']
      const items = storedEvents
        .filter((_, i) => fromSK === undefined || String(i).padStart(10, '0') >= fromSK)
        .map((ev, i) => ({
          pk: 'EVENTS',
          sk: `${String(i).padStart(10, '0')}#${ev.id}`,
          seq: i,
          type: ev.type,
          entityType: 'task',
          entityId: 'x',
          payload: JSON.stringify(ev),
        }))
      return Promise.resolve({ Items: items })
    }
    if (name === 'TransactWriteCommand') {
      if (appendResult === 'conflict') {
        const err = Object.assign(new Error('conflict'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
        })
        return Promise.reject(err)
      }
      return Promise.resolve({})
    }
    return Promise.resolve({})
  })

  return { send: sendFn } as unknown as DynamoDBDocumentClient
}

function makeTestEvents(): PalimpsestEvent[] {
  const sphereId = 'sph1' as SphereId
  return createTask({ title: 'Test', sphereId })
}

describe('handleSync — authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const client = makeClient()
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [],
      authHeader: undefined,
    })
    expect(result.statusCode).toBe(401)
  })

  it('returns 401 when token is wrong', async () => {
    const client = makeClient()
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [],
      authHeader: 'Bearer wrong',
    })
    expect(result.statusCode).toBe(401)
  })

  it('accepts correct Bearer token', async () => {
    const client = makeClient()
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [],
      authHeader: 'Bearer secret',
    })
    expect(result.statusCode).toBe(200)
  })
})

describe('handleSync — pull-only (empty events)', () => {
  it('returns ok with empty missedEvents when client is up to date', async () => {
    const client = makeClient({ currentSeq: 0, storedEvents: [] })
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [],
      authHeader: 'Bearer secret',
    })
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body)
    expect(body.status).toBe('ok')
    expect(body.missedEvents).toEqual([])
  })

  it('returns missed events when client is behind', async () => {
    const stored = makeTestEvents()
    const client = makeClient({ currentSeq: stored.length, storedEvents: stored })
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [],
      authHeader: 'Bearer secret',
    })
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body)
    expect(body.missedEvents).toHaveLength(stored.length)
  })
})

describe('handleSync — event submission', () => {
  it('returns ok with serverSeq after successful append', async () => {
    const client = makeClient({ currentSeq: 0, storedEvents: [] })
    const events = makeTestEvents()
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events,
      authHeader: 'Bearer secret',
    })
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body)
    expect(body.status).toBe('ok')
    expect(typeof body.serverSeq).toBe('number')
  })

  it('returns conflict when submitted events conflict with server state', async () => {
    // Simulate: server has a task.deleted event for the same task we're updating
    const sphereId = 'sph1' as SphereId
    const taskEvents = createTask({ title: 'T', sphereId })
    const tid = (taskEvents[0] as any).taskId

    const storedEvents: PalimpsestEvent[] = [
      ...taskEvents,
      { id: 'del1' as any, type: 'task.deleted', taskId: tid, occurredAt: '2024-01-01T00:00:01Z' } as unknown as PalimpsestEvent,
    ]

    const client = makeClient({ currentSeq: storedEvents.length, storedEvents })

    const submittedEvents: PalimpsestEvent[] = [
      { id: 'upd1' as any, type: 'task.updated', taskId: tid, patch: { title: 'New' }, occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent,
    ]

    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: taskEvents.length, // client knew about task creation, not deletion
      events: submittedEvents,
      authHeader: 'Bearer secret',
    })
    expect(result.statusCode).toBe(409)
    const body = JSON.parse(result.body)
    expect(body.status).toBe('conflict')
    expect(body.reason).toBe('task-deleted')
  })

  it('returns 422 when events array is malformed', async () => {
    const client = makeClient()
    const result = await handleSync({
      client, tableName: 'table', validToken: 'secret',
      clientSeq: 0, events: [{ not: 'a real event' } as any],
      authHeader: 'Bearer secret',
    })
    // Should return 422 for events missing required fields
    expect([422, 400]).toContain(result.statusCode)
  })
})
