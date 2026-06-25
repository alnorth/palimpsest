import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { QueryCommand, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoPalimpsestStore } from './DynamoPalimpsestStore.js'
import { EVENTS_PK, META_PK, META_SEQ_SK, eventSK } from './schema.js'
import type { PalimpsestEvent } from 'palimpsest'

function makeEvent(seq: number, id: string, type = 'sphere.created'): PalimpsestEvent {
  return { id: id as any, type: type as any, sphereId: 'sid' as any, name: 'Test', occurredAt: '2024-01-01T00:00:00Z' } as unknown as PalimpsestEvent
}

function makeClient(sendImpl: (command: unknown) => unknown): DynamoDBDocumentClient {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient
}

const TABLE = 'test-table'

describe('DynamoPalimpsestStore.readAllEvents', () => {
  it('returns empty array when no events exist', async () => {
    const client = makeClient(() => ({ Items: [] }))
    const store = new DynamoPalimpsestStore(client, TABLE)
    expect(await store.readAllEvents()).toEqual([])
  })

  it('deserializes events from DynamoDB items in sequence order', async () => {
    const ev1 = makeEvent(0, 'ev1')
    const ev2 = makeEvent(1, 'ev2', 'task.created')
    const client = makeClient(() => ({
      Items: [
        { pk: EVENTS_PK, sk: eventSK(0, 'ev1'), seq: 0, type: ev1.type, payload: JSON.stringify(ev1), entityId: 'sid', entityType: 'sphere' },
        { pk: EVENTS_PK, sk: eventSK(1, 'ev2'), seq: 1, type: ev2.type, payload: JSON.stringify(ev2), entityId: 'tid', entityType: 'task' },
      ],
    }))
    const store = new DynamoPalimpsestStore(client, TABLE)
    const events = await store.readAllEvents()
    expect(events).toHaveLength(2)
    expect(events[0]?.id).toBe('ev1')
    expect(events[1]?.id).toBe('ev2')
  })

  it('queries the correct table and partition key', async () => {
    const sendFn = vi.fn(() => ({ Items: [] }))
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    await store.readAllEvents()
    expect(sendFn).toHaveBeenCalledOnce()
    const call = (sendFn.mock.calls as any)[0][0] as InstanceType<typeof QueryCommand>
    expect(call.input.TableName).toBe(TABLE)
    expect(call.input.KeyConditionExpression).toContain('#pk')
    expect(call.input.ExpressionAttributeValues).toMatchObject({ ':pk': EVENTS_PK })
  })
})

describe('DynamoPalimpsestStore.getCurrentSeq', () => {
  it('returns 0 when no counter item exists', async () => {
    const client = makeClient(() => ({ Item: undefined }))
    const store = new DynamoPalimpsestStore(client, TABLE)
    expect(await store.getCurrentSeq()).toBe(0)
  })

  it('returns nextSeq from the counter item', async () => {
    const client = makeClient(() => ({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 7 } }))
    const store = new DynamoPalimpsestStore(client, TABLE)
    expect(await store.getCurrentSeq()).toBe(7)
  })
})

describe('DynamoPalimpsestStore.readEventsSince', () => {
  it('queries with a SK range starting from the given sequence', async () => {
    const sendFn = vi.fn(() => ({ Items: [] }))
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    await store.readEventsSince(5)
    const call = (sendFn.mock.calls as any)[0][0] as InstanceType<typeof QueryCommand>
    expect(call.input.ExpressionAttributeValues).toMatchObject({ ':fromSK': '0000000005' })
  })
})

describe('DynamoPalimpsestStore.appendEvents', () => {
  it('does nothing for an empty array', async () => {
    const sendFn = vi.fn()
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    await store.appendEvents([])
    expect(sendFn).not.toHaveBeenCalled()
  })

  it('uses TransactWriteItems with a counter condition and event puts', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 3 } }) // GetCommand for seq
      .mockResolvedValueOnce({}) // TransactWriteCommand
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    const ev = makeEvent(3, 'newev')
    await store.appendEvents([ev])

    const txCall = sendFn.mock.calls[1]?.[0] as InstanceType<typeof TransactWriteCommand>
    const items = txCall.input.TransactItems!
    // Should have: 1 Update (counter with condition) + 1 Put for the event
    expect(items).toHaveLength(2)
    expect(items[0]?.Update?.ConditionExpression).toContain('nextSeq = :expected')
    expect(items[0]?.Update?.UpdateExpression).toContain('nextSeq = :next')
  })

  it('assigns sequential SK values starting at expectedSeq', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 10 } })
      .mockResolvedValueOnce({})
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    const ev1 = makeEvent(10, 'e1')
    const ev2 = makeEvent(11, 'e2')
    await store.appendEvents([ev1, ev2])

    const txCall = sendFn.mock.calls[1]?.[0] as InstanceType<typeof TransactWriteCommand>
    const puts = txCall.input.TransactItems!.filter(i => i.Put !== undefined)
    expect(puts[0]?.Put?.Item?.sk).toBe(eventSK(10, 'e1'))
    expect(puts[1]?.Put?.Item?.sk).toBe(eventSK(11, 'e2'))
  })

  it('retries on ConditionalCheckFailedException', async () => {
    const error = Object.assign(new Error('condition failed'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    })
    const sendFn = vi.fn()
      .mockResolvedValueOnce({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 0 } }) // first get
      .mockRejectedValueOnce(error)                                                    // first write fails
      .mockResolvedValueOnce({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 1 } }) // retry get
      .mockResolvedValueOnce({})                                                       // retry write succeeds
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    await store.appendEvents([makeEvent(0, 'ev1')])
    expect(sendFn).toHaveBeenCalledTimes(4)
  })

  it('throws after 3 failed conditional checks', async () => {
    const error = Object.assign(new Error('condition failed'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    })
    const sendFn = vi.fn()
      .mockResolvedValue({ Item: { pk: META_PK, sk: META_SEQ_SK, nextSeq: 0 } })
      .mockRejectedValue(error)
    const client = { send: sendFn } as unknown as DynamoDBDocumentClient
    const store = new DynamoPalimpsestStore(client, TABLE)
    await expect(store.appendEvents([makeEvent(0, 'ev1')])).rejects.toThrow()
  })
})
