import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  handleTasks, handleTask, handleProjects, handleSpheres, handleAgendas, handleContexts,
  handleDashboard, handleProcessing, handleWaiting, handlePickList, handleSearch, handleAgendaView,
  handleCompleteTask, handleSetDueDate, handleSetStarred, handleDeleteTask, handleSetProjectAgenda,
} from './tools'
import type { TaskStore } from './tools'

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
      hasDueDate: z.boolean().optional().describe('Only tasks with a due date'),
      withoutDueDate: z.boolean().optional().describe('Only tasks with no due date'),
      hasAgenda: z.boolean().optional().describe('Only tasks linked to an agenda'),
      withoutAgenda: z.boolean().optional().describe('Only tasks not linked to an agenda'),
      hasContext: z.boolean().optional().describe('Only tasks with a context'),
      withoutContext: z.boolean().optional().describe('Only tasks with no context'),
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
      agenda: z.string().optional().describe('Filter by agenda name'),
      hasAgenda: z.boolean().optional().describe('Only projects linked to an agenda ("shared projects")'),
      withoutAgenda: z.boolean().optional().describe('Only projects not linked to an agenda'),
      isSelfOnly: z.boolean().optional().describe('Only projects explicitly marked "just mine" (true), or only projects not so marked (false)'),
      includeNextTasks: z.boolean().optional().describe('Include each project\'s open next-action tasks'),
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

  server.registerTool('dashboard', {
    description: 'Open tasks in a sphere that are due today, overdue, or starred. Always scoped to a single sphere.',
    inputSchema: {
      sphere: z.string().describe('Sphere name (required)'),
      limit: z.number().int().positive().optional().describe('Limit the number of results'),
    },
  }, args => handleDashboard(store, args))

  server.registerTool('processing', {
    description: 'Actionable tasks lacking a due date/agenda/context, active projects without a next action, and tasks waiting on an archived or missing project. Always aggregates across every sphere.',
    inputSchema: {},
  }, args => handleProcessing(store, args))

  server.registerTool('waiting', {
    description: 'Open tasks that are waiting on someone/something, grouped by waiting-for kind (review, agenda, project, trello).',
    inputSchema: {
      sphere: z.string().optional().describe('Filter by sphere name'),
    },
  }, args => handleWaiting(store, args))

  server.registerTool('pick_list', {
    description: 'Actionable tasks that have a context, grouped by context. Always scoped to a single sphere.',
    inputSchema: {
      sphere: z.string().describe('Sphere name (required)'),
    },
  }, args => handlePickList(store, args))

  server.registerTool('search', {
    description: 'Full-text search over task titles/descriptions and project names/descriptions. Matches whole words, partial words at the end (e.g. "groc" matches "groceries"), and tolerates small typos. Use this instead of listing tasks/projects when looking for something specific by name or keyword. Results combine tasks and projects, ranked by relevance.',
    inputSchema: {
      query: z.string().describe('Search text'),
      sphere: z.string().optional().describe('Filter by sphere name'),
      includeArchived: z.boolean().optional().describe('Include tasks in archived projects and archived projects themselves'),
      limit: z.number().int().positive().optional().describe('Limit the number of results'),
    },
  }, args => handleSearch(store, args))

  server.registerTool('agenda_view', {
    description: 'Tasks and projects relevant to one agenda: next-actions tagged for it (or free-floating tasks assigned to it) plus every task in any project linked to it, filtered to undated or due today/earlier, split into waiting/active. Also lists the agenda\'s linked ("shared") projects separately.',
    inputSchema: {
      agenda: z.string().describe('Agenda name or id'),
      sphere: z.string().optional().describe('Filter by sphere name (disambiguates if the agenda name is ambiguous)'),
    },
  }, args => handleAgendaView(store, args))

  server.registerTool('complete_task', {
    description: 'Mark a task complete. Recurring tasks (with a recurrence expression) advance to their next due date instead of closing; non-recurring tasks are closed. Fails if the task is already completed or deleted. The response includes `synced: false` and a `warning` if the change could not be immediately confirmed by the remote store (it is still applied and will retry automatically).',
    inputSchema: {
      id: z.string().describe('Task id'),
    },
  }, args => handleCompleteTask(store, args))

  server.registerTool('set_due_date', {
    description: 'Set or clear a task\'s due date. Fails if the task is completed or deleted.',
    inputSchema: {
      id: z.string().describe('Task id'),
      dueDate: z.string().nullable().describe('New due date (YYYY-MM-DD or "today"), or null to clear it'),
    },
  }, args => handleSetDueDate(store, args))

  server.registerTool('set_starred', {
    description: 'Star or unstar a task (surfaces it on the dashboard view regardless of due date). Fails if the task is completed or deleted.',
    inputSchema: {
      id: z.string().describe('Task id'),
      starred: z.boolean().describe('true to star, false to unstar'),
    },
  }, args => handleSetStarred(store, args))

  server.registerTool('delete_task', {
    description: 'Delete a task. Fails if the task is already deleted.',
    inputSchema: {
      id: z.string().describe('Task id'),
    },
  }, args => handleDeleteTask(store, args))

  server.registerTool('set_project_agenda', {
    description: 'Link a project to an agenda (making it a "shared project"), unlink it, or mark it explicitly self-only ("just mine"). Pass agendaId to link (or null to unlink); pass selfOnly: true to mark the project as explicitly personal, or selfOnly: false to clear that mark. agendaId and selfOnly: true cannot both be set in the same call. Use the agendas tool to look up an agenda id by name first.',
    inputSchema: {
      id: z.string().describe('Project id'),
      agendaId: z.string().nullable().optional().describe('Agenda id to link, or null to unlink'),
      selfOnly: z.boolean().optional().describe('true to mark the project explicitly self-only ("just mine"); false to clear that mark'),
    },
  }, args => handleSetProjectAgenda(store, args))

  return server
}
