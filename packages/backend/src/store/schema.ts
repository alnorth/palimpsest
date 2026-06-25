export const EVENTS_PK = 'EVENTS'
export const META_PK = 'META'
export const META_SEQ_SK = 'sequence'

export function seqToSK(seq: number): string {
  return seq.toString().padStart(10, '0')
}

export function eventSK(seq: number, eventId: string): string {
  return `${seqToSK(seq)}#${eventId}`
}

export function parseSK(sk: string): { seq: number; eventId: string } {
  const idx = sk.indexOf('#')
  return {
    seq: parseInt(sk.slice(0, idx), 10),
    eventId: sk.slice(idx + 1),
  }
}

// DynamoDB item types

export interface EventItem {
  pk: string         // EVENTS_PK
  sk: string         // eventSK(seq, eventId)
  seq: number
  type: string       // event.type discriminant
  entityType: string // e.g. 'task', 'project', 'sphere'
  entityId: string   // the typed ID of the primary entity
  payload: string    // full JSON of the event
}

export interface SequenceItem {
  pk: string         // META_PK
  sk: string         // META_SEQ_SK
  nextSeq: number
}
