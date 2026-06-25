import { describe, it, expect } from 'vitest'
import { eventSK, parseSK, seqToSK, EVENTS_PK, META_PK, META_SEQ_SK } from './schema.js'

describe('EVENTS_PK / META_PK', () => {
  it('are stable constants', () => {
    expect(EVENTS_PK).toBe('EVENTS')
    expect(META_PK).toBe('META')
    expect(META_SEQ_SK).toBe('sequence')
  })
})

describe('eventSK', () => {
  it('zero-pads sequence number to 10 digits', () => {
    expect(eventSK(0, 'abc')).toBe('0000000000#abc')
    expect(eventSK(42, 'xyz')).toBe('0000000042#xyz')
    expect(eventSK(1000000000, 'def')).toBe('1000000000#def')
  })

  it('includes the eventId after the separator', () => {
    expect(eventSK(1, 'Xk3mNp7vQa')).toBe('0000000001#Xk3mNp7vQa')
  })
})

describe('parseSK', () => {
  it('round-trips with eventSK', () => {
    const sk = eventSK(42, 'Xk3mNp7vQa')
    expect(parseSK(sk)).toEqual({ seq: 42, eventId: 'Xk3mNp7vQa' })
  })

  it('handles seq 0', () => {
    expect(parseSK('0000000000#abc')).toEqual({ seq: 0, eventId: 'abc' })
  })

  it('handles eventIds containing hashes', () => {
    // eventId should never contain '#', but the split is only on the first '#'
    expect(parseSK('0000000001#id-with-no-hash')).toEqual({ seq: 1, eventId: 'id-with-no-hash' })
  })
})

describe('seqToSK', () => {
  it('produces the same prefix as eventSK without the eventId part', () => {
    // Used for DynamoDB range queries: SK >= seqToSK(n)
    expect(seqToSK(42)).toBe('0000000042')
  })

  it('sorts correctly as strings', () => {
    const keys = [seqToSK(100), seqToSK(1), seqToSK(10), seqToSK(0)]
    expect([...keys].sort()).toEqual([seqToSK(0), seqToSK(1), seqToSK(10), seqToSK(100)])
  })
})
