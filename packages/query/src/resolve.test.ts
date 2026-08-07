import { describe, test, expect } from 'vitest'
import type { SphereId } from '@alnorth/palimpsest'
import { makeSphere, makeProject, makeAgenda, makeContext, buildState } from './fixtures'
import { resolveSphere, resolveProject, resolveAgenda, resolveContext } from './resolve'

describe('resolveSphere', () => {
  test('resolves by exact id', () => {
    const sphere = makeSphere({ name: 'Work' })
    const state = buildState({ spheres: [sphere] })
    expect(resolveSphere(state, sphere.id)).toBe(sphere.id)
  })

  test('resolves by case-insensitive exact name', () => {
    const sphere = makeSphere({ name: 'Work' })
    const state = buildState({ spheres: [sphere] })
    expect(resolveSphere(state, 'work')).toBe(sphere.id)
  })

  test('resolves by unique substring', () => {
    const sphere = makeSphere({ name: 'viaLibri' })
    const other = makeSphere({ name: 'Personal' })
    const state = buildState({ spheres: [sphere, other] })
    expect(resolveSphere(state, 'lib')).toBe(sphere.id)
  })

  test('throws with candidate list on unknown name', () => {
    const sphere = makeSphere({ name: 'Work' })
    const other = makeSphere({ name: 'Personal' })
    const state = buildState({ spheres: [sphere, other] })
    expect(() => resolveSphere(state, 'Wrk')).toThrowError(/No sphere matching "Wrk".*Work.*Personal/s)
  })

  test('throws listing matches on ambiguous substring', () => {
    const work = makeSphere({ name: 'Work' })
    const workshop = makeSphere({ name: 'Workshop' })
    const state = buildState({ spheres: [work, workshop] })
    // 'or' has no exact-name match but is a substring of both 'Work' and 'Workshop'
    expect(() => resolveSphere(state, 'or')).toThrowError(/Ambiguous sphere "or".*Work.*Workshop/s)
  })
})

describe('resolveProject scoped by sphere', () => {
  test('same project name in two spheres is disambiguated by sphereId', () => {
    const workSphere = makeSphere({ name: 'Work' })
    const personalSphere = makeSphere({ name: 'Personal' })
    const workWebsite = makeProject(workSphere, { name: 'Website' })
    const personalWebsite = makeProject(personalSphere, { name: 'Website' })
    const state = buildState({ spheres: [workSphere, personalSphere], projects: [workWebsite, personalWebsite] })

    expect(resolveProject(state, 'Website', workSphere.id)).toBe(workWebsite.id)
    expect(resolveProject(state, 'Website', personalSphere.id)).toBe(personalWebsite.id)
  })

  test('without a sphere scope, an ambiguous name across spheres throws', () => {
    const workSphere = makeSphere({ name: 'Work' })
    const personalSphere = makeSphere({ name: 'Personal' })
    const workWebsite = makeProject(workSphere, { name: 'Website' })
    const personalWebsite = makeProject(personalSphere, { name: 'Website' })
    const state = buildState({ spheres: [workSphere, personalSphere], projects: [workWebsite, personalWebsite] })

    expect(() => resolveProject(state, 'Website')).toThrowError(/Ambiguous project "Website"/)
  })

  test('unknown project within a sphere lists only that sphere\'s project names', () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Website' })
    const state = buildState({ spheres: [sphere], projects: [project] })
    expect(() => resolveProject(state, 'Nope', sphere.id)).toThrowError(/Known projects: Website/)
  })
})

describe('resolveAgenda', () => {
  test('resolves by title', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Marcia' })
    const state = buildState({ spheres: [sphere], agendas: [agenda] })
    expect(resolveAgenda(state, 'marcia')).toBe(agenda.id)
  })

  test('throws on unknown agenda name', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Marcia' })
    const state = buildState({ spheres: [sphere], agendas: [agenda] })
    expect(() => resolveAgenda(state, 'Jim')).toThrowError(/No agenda matching "Jim"/)
  })
})

describe('resolveContext', () => {
  test('resolves by name', () => {
    const sphere = makeSphere()
    const context = makeContext(sphere, { name: 'Email' })
    const state = buildState({ spheres: [sphere], contexts: [context] })
    expect(resolveContext(state, 'email')).toBe(context.id)
  })

  test('throws on unknown context when none exist', () => {
    const state = buildState({})
    expect(() => resolveContext(state, 'Email', 'nonexistent' as SphereId)).toThrowError(/No context matching "Email"/)
  })
})
