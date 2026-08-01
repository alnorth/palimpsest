import { describe, it, expect } from 'vitest'
import { MemoryJsonStore } from './jsonStore.js'

describe('MemoryJsonStore', () => {
  it('returns undefined before any save', async () => {
    const store = new MemoryJsonStore<{ foo: string }>()
    expect(await store.load()).toBeUndefined()
  })

  it('round-trips an arbitrary value', async () => {
    const store = new MemoryJsonStore<{ syncToken: string; count: number }>()
    await store.save({ syncToken: 'tok1', count: 3 })
    expect(await store.load()).toEqual({ syncToken: 'tok1', count: 3 })
  })

  it('overwrites on subsequent saves', async () => {
    const store = new MemoryJsonStore<number[]>()
    await store.save([1, 2, 3])
    await store.save([4])
    expect(await store.load()).toEqual([4])
  })
})
