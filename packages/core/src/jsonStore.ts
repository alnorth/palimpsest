export interface JsonStore<T> {
  load(): Promise<T | undefined>
  save(value: T): Promise<void>
}

export class MemoryJsonStore<T> implements JsonStore<T> {
  private value: T | undefined

  async load(): Promise<T | undefined> {
    return this.value
  }

  async save(value: T): Promise<void> {
    this.value = value
  }
}
