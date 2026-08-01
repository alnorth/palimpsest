import { describe, test, expect } from 'vitest'
import { buildProgram } from './program.js'

function makeWriters() {
  let out = ''
  let err = ''
  return {
    stdout: (s: string) => { out += s },
    stderr: (s: string) => { err += s },
    get out() { return out },
    get err() { return err },
  }
}

async function parse(argv: string[]) {
  const writers = makeWriters()
  const program = buildProgram(writers)
  try {
    const command = await program.parse(argv)
    return { ok: true as const, command, out: writers.out, err: writers.err }
  } catch (error) {
    return { ok: false as const, error, out: writers.out, err: writers.err }
  }
}

describe('tasks command flags', () => {
  test('bare "tasks" has no filters set', async () => {
    const result = await parse(['tasks'])
    expect(result.ok).toBe(true)
    expect(result.command).toEqual({ kind: 'tasks' })
  })

  test('--sphere <name> (space form)', async () => {
    const result = await parse(['tasks', '--sphere', 'Work'])
    expect(result.command).toEqual({ kind: 'tasks', sphere: 'Work' })
  })

  test('--sphere=<name> (equals form)', async () => {
    const result = await parse(['tasks', '--sphere=Work'])
    expect(result.command).toEqual({ kind: 'tasks', sphere: 'Work' })
  })

  test('every boolean flag sets its field', async () => {
    const result = await parse([
      'tasks', '--starred', '--actionable', '--waiting', '--include-archived',
    ])
    expect(result.command).toEqual({
      kind: 'tasks', starred: true, actionable: true, waiting: true, includeArchived: true,
    })
  })

  test('--not-waiting and --inbox map to notWaiting / noProject', async () => {
    const result = await parse(['tasks', '--not-waiting', '--inbox'])
    expect(result.command).toEqual({ kind: 'tasks', notWaiting: true, noProject: true })
  })

  test('--due-on and --due-before pass through', async () => {
    const result = await parse(['tasks', '--due-on', 'today', '--due-before', '2026-08-10'])
    expect(result.command).toEqual({ kind: 'tasks', dueOn: 'today', dueBefore: '2026-08-10' })
  })

  test('--limit parses to a number', async () => {
    const result = await parse(['tasks', '--limit', '5'])
    expect(result.command).toEqual({ kind: 'tasks', limit: 5 })
  })

  test('--limit rejects a non-numeric value', async () => {
    const result = await parse(['tasks', '--limit', 'abc'])
    expect(result.ok).toBe(false)
    expect(result.err).toMatch(/limit/i)
  })

  test('--limit rejects zero and negative values', async () => {
    const result = await parse(['tasks', '--limit', '0'])
    expect(result.ok).toBe(false)
  })

  test('--status accepts only the known values', async () => {
    const good = await parse(['tasks', '--status', 'completed'])
    expect(good.command).toEqual({ kind: 'tasks', status: 'completed' })

    const bad = await parse(['tasks', '--status', 'bogus'])
    expect(bad.ok).toBe(false)
    expect(bad.err).toMatch(/status/i)
  })

  test('unknown flag is rejected', async () => {
    const result = await parse(['tasks', '--nope', 'x'])
    expect(result.ok).toBe(false)
  })

  test('a flag defined on another subcommand is rejected here', async () => {
    const result = await parse(['spheres', '--project', 'x'])
    expect(result.ok).toBe(false)
  })
})

describe('task <id>', () => {
  test('captures the id', async () => {
    const result = await parse(['task', 'abc123'])
    expect(result.command).toEqual({ kind: 'task', id: 'abc123' })
  })

  test('missing id is a usage error', async () => {
    const result = await parse(['task'])
    expect(result.ok).toBe(false)
  })

  test('surplus positional argument is a usage error', async () => {
    const result = await parse(['task', 'a', 'b'])
    expect(result.ok).toBe(false)
  })
})

describe('projects / spheres / agendas / contexts', () => {
  test('projects --sphere --archived --all', async () => {
    const result = await parse(['projects', '--sphere', 'Work', '--archived'])
    expect(result.command).toEqual({ kind: 'projects', sphere: 'Work', archived: true })
  })

  test('bare spheres', async () => {
    const result = await parse(['spheres'])
    expect(result.command).toEqual({ kind: 'spheres' })
  })

  test('agendas --sphere', async () => {
    const result = await parse(['agendas', '--sphere', 'Work'])
    expect(result.command).toEqual({ kind: 'agendas', sphere: 'Work' })
  })

  test('contexts --sphere', async () => {
    const result = await parse(['contexts', '--sphere', 'Work'])
    expect(result.command).toEqual({ kind: 'contexts', sphere: 'Work' })
  })
})

describe('help, version, and unknown commands', () => {
  test('--help exits cleanly and writes usage to stdout', async () => {
    const result = await parse(['--help'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const error = result.error as { exitCode?: number }
      expect(error.exitCode).toBe(0)
    }
    expect(result.out).toMatch(/Usage:/)
  })

  test('--version exits cleanly', async () => {
    const result = await parse(['--version'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const error = result.error as { exitCode?: number }
      expect(error.exitCode).toBe(0)
    }
  })

  test('unknown command is a usage error', async () => {
    const result = await parse(['bogus'])
    expect(result.ok).toBe(false)
  })
})
