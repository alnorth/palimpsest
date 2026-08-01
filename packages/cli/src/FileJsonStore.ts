import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { JsonStore } from 'palimpsest'

export class FileJsonStore<T> implements JsonStore<T> {
  constructor(private readonly filePath: string) {}

  async load(): Promise<T | undefined> {
    if (!existsSync(this.filePath)) return undefined
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    return raw ? (JSON.parse(raw) as T) : undefined
  }

  async save(value: T): Promise<void> {
    writeFileSync(this.filePath, JSON.stringify(value), 'utf-8')
  }
}
