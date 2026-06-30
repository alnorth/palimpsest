export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

export function lines(output: string): string[] {
  return stripAnsi(output).split('\n')
}
