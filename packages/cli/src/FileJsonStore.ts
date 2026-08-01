import { readFile, writeFile } from 'node:fs/promises'
import type { JsonStore } from 'palimpsest'

export class FileJsonStore<T> implements JsonStore<T> {
  constructor(private readonly filePath: string) {}

  async load(): Promise<T | undefined> {
    let raw: string
    try {
      raw = (await readFile(this.filePath, 'utf-8')).trim()
    } catch {
      return undefined
    }
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }

  async save(value: T): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(value), 'utf-8')
  }
}
