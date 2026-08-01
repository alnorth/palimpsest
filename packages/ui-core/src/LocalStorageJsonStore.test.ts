// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStorageJsonStore } from './LocalStorageJsonStore.js'

describe('LocalStorageJsonStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns undefined when localStorage is empty', async () => {
    const store = new LocalStorageJsonStore<{ syncToken: string }>('test_key')
    expect(await store.load()).toBeUndefined()
  })

  it('round-trips an arbitrary value via save and load', async () => {
    const store = new LocalStorageJsonStore<{ syncToken: string; count: number }>('test_key')
    const value = { syncToken: 'tok1', count: 3 }
    await store.save(value)
    expect(await store.load()).toEqual(value)
  })

  it('returns undefined when stored value is corrupt JSON', async () => {
    localStorage.setItem('test_key', 'not valid json{')
    const store = new LocalStorageJsonStore('test_key')
    expect(await store.load()).toBeUndefined()
  })

  it('overwrites previous data on each save', async () => {
    const store = new LocalStorageJsonStore<number[]>('test_key')
    await store.save([1])
    await store.save([2])
    expect(await store.load()).toEqual([2])
  })

  it('uses the provided localStorage key', async () => {
    const store = new LocalStorageJsonStore<number[]>('custom_key')
    await store.save([1])
    expect(localStorage.getItem('custom_key')).not.toBeNull()
    expect(localStorage.getItem('test_key')).toBeNull()
    expect(await store.load()).toEqual([1])
  })
})
