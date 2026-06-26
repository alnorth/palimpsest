export function indexAfterAppend(list: readonly unknown[]): number {
  return list.length
}

export function indexAfterRemove(list: readonly unknown[], selected: number): number {
  return Math.max(0, Math.min(selected, list.length - 2))
}
