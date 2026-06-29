import { describe, it, expect } from 'vitest'
import { computeLabels } from './labels.js'
import type { AgendaId, ContextId } from 'palimpsest'

const jimId    = 'agenda-jim'    as AgendaId
const marciaId = 'agenda-marcia' as AgendaId
const ctxQuick = 'ctx-quick'     as ContextId

describe('computeLabels', () => {
  it('returns empty array for no fields', () => {
    expect(computeLabels({})).toEqual([])
  })

  it('adds next label', () => {
    expect(computeLabels({ isNext: true })).toEqual(['next'])
  })

  it('adds agenda label', () => {
    expect(computeLabels({ agendaId: jimId })).toEqual(['jim'])
  })

  it('adds context label', () => {
    expect(computeLabels({ contextId: ctxQuick })).toEqual(['quick'])
  })

  it('waitingFor review → waiting + nonagenda', () => {
    expect(computeLabels({ waitingFor: { kind: 'review' } })).toEqual(['waiting', 'nonagenda'])
  })

  it('waitingFor agenda → waiting + agenda label', () => {
    expect(computeLabels({ waitingFor: { kind: 'agenda', agendaId: jimId } }))
      .toEqual(['waiting', 'jim'])
  })

  it('waitingFor agenda does not duplicate if agendaId already present', () => {
    // agendaId and waitingFor.agenda are the same person
    expect(computeLabels({ agendaId: jimId, waitingFor: { kind: 'agenda', agendaId: jimId } }))
      .toEqual(['jim', 'waiting'])
  })

  it('waitingFor agenda with different agendaId adds both labels', () => {
    expect(computeLabels({ agendaId: jimId, waitingFor: { kind: 'agenda', agendaId: marciaId } }))
      .toEqual(['jim', 'waiting', 'marcia'])
  })

  it('waitingFor project → waiting + project', () => {
    expect(computeLabels({ waitingFor: { kind: 'project', projectId: 'p1' as any } }))
      .toEqual(['waiting', 'project'])
  })

  it('waitingFor trello → waiting + trello', () => {
    expect(computeLabels({ waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } }))
      .toEqual(['waiting', 'trello'])
  })

  it('combines next + agenda + context', () => {
    expect(computeLabels({ isNext: true, agendaId: jimId, contextId: ctxQuick }))
      .toEqual(['next', 'jim', 'quick'])
  })

  it('combines isNext + waitingFor + context', () => {
    expect(computeLabels({ isNext: true, waitingFor: { kind: 'review' }, contextId: ctxQuick }))
      .toEqual(['next', 'waiting', 'nonagenda', 'quick'])
  })

  it.each([
    ['ctx-tools',    'tools',    'home'],
    ['ctx-sewing',   'sewing',   'home'],
    ['ctx-no-tools', 'notools',  'home'],
    ['ctx-loft',     'loft',     'home'],
  ])('%s adds %s + home', (contextId, label, parent) => {
    expect(computeLabels({ contextId: contextId as ContextId })).toEqual([label, parent])
  })

  it.each([
    ['ctx-phone',      'phone',      'admin'],
    ['ctx-laptop',     'laptop',     'admin'],
    ['ctx-deepthought','deepthought','admin'],
  ])('%s adds %s + admin', (contextId, label, parent) => {
    expect(computeLabels({ contextId: contextId as ContextId })).toEqual([label, parent])
  })
})
