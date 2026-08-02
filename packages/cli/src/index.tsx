import { createStore } from './store.js'
import { runCli } from './cli/run.js'

const argv = process.argv.slice(2)

if (argv.length === 0) {
  const { runTui } = await import('./tui.js')
  runTui(createStore())
} else {
  let out = ''
  let err = ''
  const code = await runCli(argv, {
    createStore,
    stdout: s => { out += s },
    stderr: s => { err += s },
  })
  if (err) process.stderr.write(err)
  if (out) await new Promise<void>(resolve => process.stdout.write(out, () => resolve()))
  process.exit(code)
}
