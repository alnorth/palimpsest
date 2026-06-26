import { QueryCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { PalimpsestStore } from 'palimpsest'
import type { PalimpsestEvent } from 'palimpsest'
import {
  EVENTS_PK, META_PK, META_SEQ_SK,
  eventSK, seqToSK,
} from './schema.js'
import type { EventItem } from './schema.js'

function entityTypeFromEvent(event: PalimpsestEvent): string {
  return event.type.split('.')[0] ?? 'unknown'
}

function entityIdFromEvent(event: PalimpsestEvent): string {
  const e = event as unknown as Record<string, unknown>
  return (
    (e['taskId'] ?? e['projectId'] ?? e['sphereId'] ?? e['agendaId'] ?? e['contextId'] ?? e['id'] ?? '')
  ) as string
}

function isConditionalCheckFailed(err: unknown): boolean {
  if (err instanceof Error && err.name === 'TransactionCanceledException') {
    const reasons = (err as any).CancellationReasons as Array<{ Code?: string }> | undefined
    return reasons?.some(r => r.Code === 'ConditionalCheckFailed') ?? false
  }
  return false
}

export class DynamoPalimpsestStore extends PalimpsestStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    super()
  }

  async readAllEvents(): Promise<PalimpsestEvent[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': EVENTS_PK },
    }))
    return (result.Items ?? []).map(item => JSON.parse((item as EventItem).payload) as PalimpsestEvent)
  }

  async readEventsSince(seq: number): Promise<PalimpsestEvent[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: '#pk = :pk AND #sk >= :fromSK',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': EVENTS_PK, ':fromSK': seqToSK(seq) },
    }))
    return (result.Items ?? []).map(item => JSON.parse((item as EventItem).payload) as PalimpsestEvent)
  }

  async getCurrentSeq(): Promise<number> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: META_PK, sk: META_SEQ_SK },
    }))
    return (result.Item as { nextSeq?: number } | undefined)?.nextSeq ?? 0
  }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    const MAX_RETRIES = 3
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const currentSeq = await this.getCurrentSeq()
      try {
        await this.transactAppend(events, currentSeq)
        return
      } catch (err) {
        if (isConditionalCheckFailed(err) && attempt < MAX_RETRIES - 1) continue
        throw err
      }
    }
  }

  private async transactAppend(events: PalimpsestEvent[], expectedSeq: number): Promise<void> {
    const puts = events.map((event, i) => ({
      Put: {
        TableName: this.tableName,
        Item: {
          pk: EVENTS_PK,
          sk: eventSK(expectedSeq + i, event.id),
          seq: expectedSeq + i,
          type: event.type,
          entityType: entityTypeFromEvent(event),
          entityId: entityIdFromEvent(event),
          payload: JSON.stringify(event),
        } satisfies EventItem,
      },
    }))

    await this.client.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: this.tableName,
            Key: { pk: META_PK, sk: META_SEQ_SK },
            UpdateExpression: 'SET nextSeq = :next',
            ConditionExpression: 'attribute_not_exists(nextSeq) OR nextSeq = :expected',
            ExpressionAttributeValues: { ':next': expectedSeq + events.length, ':expected': expectedSeq },
          },
        },
        ...puts,
      ],
    }))
  }
}
