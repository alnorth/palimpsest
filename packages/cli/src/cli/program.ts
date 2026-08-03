import { Command, Option, InvalidArgumentError } from 'commander'
import type { ParsedCommand, StatusArg } from './runQuery.js'

const VERSION = '0.1.0'

export interface ProgramWriters {
  stdout: (s: string) => void
  stderr: (s: string) => void
}

interface TasksOpts {
  status?: StatusArg
  sphere?: string
  project?: string
  agenda?: string
  context?: string
  starred?: boolean
  actionable?: boolean
  waiting?: boolean
  notWaiting?: boolean
  inbox?: boolean
  dueOn?: string
  dueBefore?: string
  hasDueDate?: boolean
  withoutDueDate?: boolean
  hasAgenda?: boolean
  withoutAgenda?: boolean
  hasContext?: boolean
  withoutContext?: boolean
  includeArchived?: boolean
  limit?: number
}

interface ProjectsOpts {
  sphere?: string
  archived?: boolean
  all?: boolean
}

interface SphereScopedOpts {
  sphere?: string
}

function parseLimit(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError('limit must be a positive integer')
  }
  return n
}

function configure(command: Command, writers: ProgramWriters): Command {
  return command.exitOverride().configureOutput({
    writeOut: writers.stdout,
    writeErr: writers.stderr,
    outputError: (str, write) => write(str),
  })
}

export interface Program {
  parse: (argv: string[]) => Promise<ParsedCommand>
}

export function buildProgram(writers: ProgramWriters): Program {
  let command: ParsedCommand | undefined

  const program = configure(new Command(), writers)
  program
    .name('palimpsest')
    .description('Query your Palimpsest task list')
    .version(VERSION)

  const tasksCmd = configure(program.command('tasks'), writers)
  tasksCmd
    .description('List tasks')
    .option('--sphere <name>', 'filter by sphere name')
    .option('--project <name>', 'filter by project name')
    .option('--agenda <name>', 'filter by agenda name')
    .option('--context <name>', 'filter by context name')
    .addOption(new Option('--status <status>', 'open|completed|deleted|any (default: open)').choices(['open', 'completed', 'deleted', 'any']))
    .option('--starred', 'only starred tasks')
    .option('--actionable', 'only actionable tasks')
    .option('--waiting', 'only tasks waiting on someone/something')
    .option('--not-waiting', 'only tasks not waiting')
    .option('--inbox', 'only tasks with no project')
    .option('--due-on <date>', 'due on this date (YYYY-MM-DD or "today")')
    .option('--due-before <date>', 'due before this date (YYYY-MM-DD or "today")')
    .option('--has-due-date', 'only tasks with a due date')
    .option('--without-due-date', 'only tasks with no due date')
    .option('--has-agenda', 'only tasks linked to an agenda')
    .option('--without-agenda', 'only tasks not linked to an agenda')
    .option('--has-context', 'only tasks with a context')
    .option('--without-context', 'only tasks with no context')
    .option('--include-archived', 'include tasks whose project is archived')
    .option('--limit <n>', 'limit number of results', parseLimit)
    .action((opts: TasksOpts) => {
      command = {
        kind: 'tasks',
        ...(opts.status !== undefined && { status: opts.status }),
        ...(opts.sphere !== undefined && { sphere: opts.sphere }),
        ...(opts.project !== undefined && { project: opts.project }),
        ...(opts.agenda !== undefined && { agenda: opts.agenda }),
        ...(opts.context !== undefined && { context: opts.context }),
        ...(opts.starred === true && { starred: true }),
        ...(opts.actionable === true && { actionable: true }),
        ...(opts.waiting === true && { waiting: true }),
        ...(opts.notWaiting === true && { notWaiting: true }),
        ...(opts.inbox === true && { noProject: true }),
        ...(opts.dueOn !== undefined && { dueOn: opts.dueOn }),
        ...(opts.dueBefore !== undefined && { dueBefore: opts.dueBefore }),
        ...(opts.hasDueDate === true && { hasDueDate: true }),
        ...(opts.withoutDueDate === true && { withoutDueDate: true }),
        ...(opts.hasAgenda === true && { hasAgenda: true }),
        ...(opts.withoutAgenda === true && { withoutAgenda: true }),
        ...(opts.hasContext === true && { hasContext: true }),
        ...(opts.withoutContext === true && { withoutContext: true }),
        ...(opts.includeArchived === true && { includeArchived: true }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      }
    })

  const taskCmd = configure(program.command('task'), writers)
  taskCmd
    .description('Show a single task by id')
    .argument('<id>', 'task id')
    .action((id: string) => {
      command = { kind: 'task', id }
    })

  const projectsCmd = configure(program.command('projects'), writers)
  projectsCmd
    .description('List projects')
    .option('--sphere <name>', 'filter by sphere name')
    .option('--archived', 'only archived projects')
    .option('--all', 'include both active and archived projects')
    .action((opts: ProjectsOpts) => {
      command = {
        kind: 'projects',
        ...(opts.sphere !== undefined && { sphere: opts.sphere }),
        ...(opts.archived === true && { archived: true }),
        ...(opts.all === true && { all: true }),
      }
    })

  const spheresCmd = configure(program.command('spheres'), writers)
  spheresCmd
    .description('List spheres')
    .action(() => {
      command = { kind: 'spheres' }
    })

  const agendasCmd = configure(program.command('agendas'), writers)
  agendasCmd
    .description('List agendas')
    .option('--sphere <name>', 'filter by sphere name')
    .action((opts: SphereScopedOpts) => {
      command = {
        kind: 'agendas',
        ...(opts.sphere !== undefined && { sphere: opts.sphere }),
      }
    })

  const contextsCmd = configure(program.command('contexts'), writers)
  contextsCmd
    .description('List contexts')
    .option('--sphere <name>', 'filter by sphere name')
    .action((opts: SphereScopedOpts) => {
      command = {
        kind: 'contexts',
        ...(opts.sphere !== undefined && { sphere: opts.sphere }),
      }
    })

  return {
    async parse(argv: string[]): Promise<ParsedCommand> {
      command = undefined
      await program.parseAsync(argv, { from: 'user' })
      if (command === undefined) throw new Error('No command was parsed.')
      return command
    },
  }
}
