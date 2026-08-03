import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  handleTasks, handleTask, handleProjects, handleSpheres, handleAgendas, handleContexts,
} from './tools.js'
import type { TaskStore } from './tools.js'

const VERSION = '0.1.0'

const STATUS_VALUES = ['open', 'completed', 'deleted', 'any'] as const

export function createMcpServer(store: TaskStore): McpServer {
  const server = new McpServer({ name: 'palimpsest', version: VERSION })

  server.registerTool('tasks', {
    description: 'List tasks. Defaults to open tasks across all spheres; narrow with any combination of filters.',
    inputSchema: {
      sphere: z.string().optional().describe('Filter by sphere name'),
      project: z.string().optional().describe('Filter by project name'),
      agenda: z.string().optional().describe('Filter by agenda name'),
      context: z.string().optional().describe('Filter by context name'),
      status: z.enum(STATUS_VALUES).optional().describe('open (default), completed, deleted, or any'),
      starred: z.boolean().optional().describe('Only starred tasks'),
      actionable: z.boolean().optional().describe('Only actionable tasks'),
      waiting: z.boolean().optional().describe('Only tasks waiting on someone/something'),
      notWaiting: z.boolean().optional().describe('Only tasks not waiting'),
      inbox: z.boolean().optional().describe('Only tasks with no project'),
      dueOn: z.string().optional().describe('Due on this date (YYYY-MM-DD or "today")'),
      dueBefore: z.string().optional().describe('Due before this date (YYYY-MM-DD or "today")'),
      includeArchived: z.boolean().optional().describe('Include tasks whose project is archived'),
      limit: z.number().int().positive().optional().describe('Limit the number of results'),
    },
  }, args => handleTasks(store, args))

  server.registerTool('task', {
    description: 'Show a single task by id.',
    inputSchema: {
      id: z.string().describe('Task id'),
    },
  }, args => handleTask(store, args))

  server.registerTool('projects', {
    description: 'List projects.',
    inputSchema: {
      sphere: z.string().optional().describe('Filter by sphere name'),
      archived: z.boolean().optional().describe('Only archived projects'),
      all: z.boolean().optional().describe('Include both active and archived projects'),
    },
  }, args => handleProjects(store, args))

  server.registerTool('spheres', {
    description: 'List spheres.',
    inputSchema: {},
  }, args => handleSpheres(store, args))

  server.registerTool('agendas', {
    description: 'List agendas.',
    inputSchema: {
      sphere: z.string().optional().describe('Filter by sphere name'),
    },
  }, args => handleAgendas(store, args))

  server.registerTool('contexts', {
    description: 'List contexts.',
    inputSchema: {
      sphere: z.string().optional().describe('Filter by sphere name'),
    },
  }, args => handleContexts(store, args))

  return server
}
