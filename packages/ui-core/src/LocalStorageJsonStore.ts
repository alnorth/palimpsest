import type { JsonStore } from 'palimpsest'

export class LocalStorageJsonStore<T> implements JsonStore<T> {
  constructor(private readonly key: string) {}

  async load(): Promise<T | undefined> {
    const raw = localStorage.getItem(this.key)
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }

  async save(value: T): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(value))
  }
}
