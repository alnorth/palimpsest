import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createStore } from './store'
import { createMcpServer } from './server'

try {
  const store = createStore()
  await store.init()

  const server = createMcpServer(store)
  await server.connect(new StdioServerTransport())
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
