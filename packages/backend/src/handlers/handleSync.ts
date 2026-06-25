import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { PalimpsestEvent } from 'palimpsest'
import { DynamoPalimpsestStore } from '../store/DynamoPalimpsestStore.js'
import { analyzeConflict } from '../conflict/analyze.js'
import { verifyToken } from '../auth/verify.js'

interface HandleSyncInput {
  client: DynamoDBDocumentClient
  tableName: string
  validToken: string
  authHeader: string | undefined
  clientSeq: number
  events: PalimpsestEvent[]
}

interface HttpResponse {
  statusCode: number
  body: string
  headers?: Record<string, string>
}

function json(statusCode: number, body: unknown): HttpResponse {
  return { statusCode, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
}

function isValidEvent(e: unknown): e is PalimpsestEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as any).id === 'string' &&
    typeof (e as any).type === 'string' &&
    typeof (e as any).occurredAt === 'string'
  )
}

export async function handleSync(input: HandleSyncInput): Promise<HttpResponse> {
  const { client, tableName, validToken, authHeader, clientSeq, events } = input

  if (!verifyToken(authHeader, validToken)) {
    return json(401, { error: 'Unauthorized' })
  }

  // Validate event shape
  for (const ev of events) {
    if (!isValidEvent(ev)) {
      return json(422, { error: 'Invalid event shape' })
    }
  }

  const store = new DynamoPalimpsestStore(client, tableName)
  const serverSeq = await store.getCurrentSeq()

  // Fetch events the client hasn't seen
  const missedEvents = clientSeq < serverSeq
    ? await store.readEventsSince(clientSeq)
    : []

  // Pull-only: no events to submit
  if (events.length === 0) {
    return json(200, { status: 'ok', serverSeq, missedEvents })
  }

  // No divergence — safe to append directly
  if (clientSeq >= serverSeq) {
    await store.appendEvents(events)
    return json(200, { status: 'ok', serverSeq: serverSeq + events.length, missedEvents: [] })
  }

  // Divergence: run conflict analysis
  const conflictResult = analyzeConflict(events, missedEvents)

  if (conflictResult.status === 'conflict') {
    return json(409, {
      status: 'conflict',
      reason: conflictResult.reason,
      serverSeq,
      missedEvents,
      conflictingEvents: conflictResult.conflictingEvents,
    })
  }

  // Safe: idempotent or no overlap — append events
  if (!conflictResult.idempotent) {
    await store.appendEvents(events)
  }

  return json(200, {
    status: 'ok',
    serverSeq: conflictResult.idempotent ? serverSeq : serverSeq + events.length,
    missedEvents,
  })
}
