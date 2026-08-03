import { buildStateFromConfig, PALIMPSEST_CONFIG, createEmptyState } from 'palimpsest'
import { TodoistStore } from 'palimpsest-todoist'

export function createStore(env: NodeJS.ProcessEnv = process.env): TodoistStore {
  const token = env['PALIMPSEST_TODOIST_TOKEN']
  if (token === undefined) {
    throw new Error('PALIMPSEST_TODOIST_TOKEN environment variable is required.')
  }

  const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }
  return new TodoistStore(token, { initialState: configState })
}
