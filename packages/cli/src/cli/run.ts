import { CommanderError } from 'commander'
import type { PalimpsestStore } from 'palimpsest'
import { buildProgram } from './program.js'
import { runQuery } from './runQuery.js'

export interface RunDeps {
  createStore: () => PalimpsestStore
  stdout: (s: string) => void
  stderr: (s: string) => void
  today?: string
}

export async function runCli(argv: string[], deps: RunDeps): Promise<number> {
  const program = buildProgram({ stdout: deps.stdout, stderr: deps.stderr })

  let command
  try {
    command = await program.parse(argv)
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    deps.stderr(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  try {
    const store = deps.createStore()
    await store.init()
    const state = await store.getState()
    const data = runQuery(state, command, { ...(deps.today !== undefined && { today: deps.today }) })
    deps.stdout(`${JSON.stringify({ ok: true, ...data }, null, 2)}\n`)
    return 0
  } catch (error) {
    deps.stderr(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
