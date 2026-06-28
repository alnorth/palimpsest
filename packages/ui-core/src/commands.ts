import { CLEAR } from 'palimpsest'
import type { Command, CommandId } from './types.js'
import type { TopLevelView } from './types.js'
import { VIEW_CONFIG } from './viewModel.js'
import type { ViewModel } from './viewModel.js'

export function getCommands(vm: ViewModel): Partial<Record<CommandId, Command>> {
  const { view, mode, currentTask, selectedProject, activeSphere, listItems, showCompleted, showArchived, canGoBack, agendas, contexts, spheres } = vm
  const commands: Partial<Record<CommandId, Command>> = {}

  if (mode !== 'list') return commands

  const isTopLevel = view === 'dashboard' || view === 'tasks' || view === 'projects' || view === 'processing'
  const isNormalView = isTopLevel || view === 'project'

  // ── Add task ─────────────────────────────────────────────────────────────────
  if (isNormalView && !showCompleted) {
    commands['add-task'] = {
      id: 'add-task',
      label: 'task',
      group: 'create',
      key: 'q',
      action: { type: 'set-mode', mode: 'adding' },
    }
  }

  // ── Add project ───────────────────────────────────────────────────────────────
  if (isNormalView && !showArchived) {
    commands['add-project'] = {
      id: 'add-project',
      label: 'project',
      group: 'create',
      key: 'j',
      action: { type: 'set-mode', mode: 'adding-project' },
    }
  }

  // ── Edit task title ──────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['edit-task'] = {
      id: 'edit-task',
      label: 'edit',
      group: 'state',
      key: 'e',
      action: { type: 'set-mode', mode: 'editing-task' },
    }
  }

  // ── Edit task description ────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['edit-description'] = {
      id: 'edit-description',
      label: 'description',
      group: 'state',
      key: 'd',
      action: { type: 'set-mode', mode: 'editing-description' },
    }
  }

  // ── Edit project name ────────────────────────────────────────────────────────
  if (view === 'projects' && !showArchived && selectedProject !== undefined) {
    commands['edit-project'] = {
      id: 'edit-project',
      label: 'edit',
      group: 'state',
      key: 'e',
      action: { type: 'set-mode', mode: 'editing-project' },
    }
  }

  // ── Complete / uncomplete task ───────────────────────────────────────────────
  if (currentTask !== undefined) {
    if (currentTask.status === 'open') {
      commands['complete-task'] = {
        id: 'complete-task',
        label: 'complete',
        group: 'state',
        key: 'c',
        action: { type: 'complete-task', taskId: currentTask.id },
      }
    } else {
      commands['uncomplete-task'] = {
        id: 'uncomplete-task',
        label: 'reopen',
        group: 'state',
        key: 'c',
        action: { type: 'uncomplete-task', taskId: currentTask.id },
      }
    }
  }

  // ── Toggle next ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open' && currentTask.projectId !== undefined) {
    commands['toggle-next'] = {
      id: 'toggle-next',
      label: 'next',
      group: 'state',
      key: 'n',
      action: { type: 'toggle-next', taskId: currentTask.id },
    }
  }

  // ── Toggle starred ───────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['star'] = {
      id: 'star',
      label: 'star',
      group: 'state',
      key: 's',
      action: { type: 'toggle-starred', taskId: currentTask.id },
    }
  }

  // ── Toggle waiting ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['toggle-waiting'] = {
      id: 'toggle-waiting',
      label: 'waiting',
      group: 'state',
      key: 'w',
      action: { type: 'toggle-waiting', taskId: currentTask.id },
    }
  }

  // ── Pick due date ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['pick-due-date'] = {
      id: 'pick-due-date',
      label: 'due date',
      group: 'state',
      key: 'u',
      action: {
        type: 'navigate',
        navState: { view: 'picking-due-date', selected: 0, activeTaskId: currentTask.id },
      },
    }
  }

  // ── Set recurrence ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['set-recurrence'] = {
      id: 'set-recurrence',
      label: 'recurring',
      group: 'state',
      key: 'r',
      action: { type: 'set-mode', mode: 'editing-recurrence' },
    }
  }

  // ── Pick project ─────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands['pick-project'] = {
      id: 'pick-project',
      label: 'project',
      group: 'state',
      key: 'p',
      action: {
        type: 'navigate',
        navState: { view: 'picking-project-for-task', selected: 0, activeTaskId: currentTask.id, searchQuery: '' },
      },
    }
  }

  // ── Pick agenda ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    const agendaIdx = currentTask.agendaId !== undefined
      ? Math.max(0, agendas.findIndex(a => a.id === currentTask.agendaId) + 1)
      : 0
    commands['pick-agenda'] = {
      id: 'pick-agenda',
      label: 'agenda',
      group: 'state',
      key: 'a',
      action: {
        type: 'navigate',
        navState: { view: 'picking-agenda-for-task', selected: agendaIdx, activeTaskId: currentTask.id },
      },
    }
  }

  // ── Pick context ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    const contextIdx = currentTask.contextId !== undefined
      ? Math.max(0, contexts.findIndex(c => c.id === currentTask.contextId) + 1)
      : 0
    commands['pick-context'] = {
      id: 'pick-context',
      label: 'context',
      group: 'state',
      key: 'k',
      action: {
        type: 'navigate',
        navState: { view: 'picking-context-for-task', selected: contextIdx, activeTaskId: currentTask.id },
      },
    }
  }

  // ── Archive / unarchive project ──────────────────────────────────────────────
  if (view === 'projects' && selectedProject !== undefined) {
    if (selectedProject.isArchived) {
      commands['unarchive-project'] = {
        id: 'unarchive-project',
        label: 'unarchive',
        group: 'state',
        key: 'x',
        action: { type: 'unarchive-project', projectId: selectedProject.id },
      }
    } else {
      commands['archive-project'] = {
        id: 'archive-project',
        label: 'archive',
        group: 'state',
        key: 'x',
        action: { type: 'archive-project', projectId: selectedProject.id },
      }
    }
  }

  // ── View project (from task) ─────────────────────────────────────────────────
  if (currentTask?.projectId !== undefined) {
    commands['view-project'] = {
      id: 'view-project',
      label: 'view project',
      group: 'view',
      key: 'P',
      action: {
        type: 'navigate',
        navState: { view: 'project', selected: 0, activeProjectId: currentTask.projectId, showCompleted: false },
      },
    }
  }

  // ── Toggle completed ─────────────────────────────────────────────────────────
  if (view === 'tasks') {
    commands['toggle-completed'] = {
      id: 'toggle-completed',
      label: showCompleted ? 'show open' : 'show completed',
      group: 'view',
      key: 'C',
      action: { type: 'navigate', navState: { view: 'tasks', selected: 0, showCompleted: !showCompleted } },
    }
  }
  if (view === 'project' && vm.activeProject !== undefined) {
    commands['toggle-completed'] = {
      id: 'toggle-completed',
      label: showCompleted ? 'show open' : 'show completed',
      group: 'view',
      key: 'C',
      action: { type: 'navigate', navState: { view: 'project', selected: 0, activeProjectId: vm.activeProject.id, showCompleted: !showCompleted } },
    }
  }

  // ── Toggle archived ──────────────────────────────────────────────────────────
  if (view === 'projects') {
    commands['toggle-archived'] = {
      id: 'toggle-archived',
      label: showArchived ? 'show active' : 'show archived',
      group: 'view',
      key: 'X',
      action: { type: 'navigate', navState: { view: 'projects', selected: 0, showArchived: !showArchived } },
    }
  }

  // ── Pick view ─────────────────────────────────────────────────────────────────
  commands['pick-view'] = {
    id: 'pick-view',
    label: 'view',
    group: 'view',
    key: 'v',
    action: {
      type: 'navigate',
      navState: { view: 'picking-view', selected: Math.max(0, VIEW_CONFIG.findIndex(item => item.id === view)) },
    },
  }

  // ── Cycle sphere ─────────────────────────────────────────────────────────────
  if (isTopLevel && spheres.length > 0) {
    const sphereIdx = spheres.findIndex(s => s.id === activeSphere?.id)
    const nextSphere = spheres[(sphereIdx + 1) % spheres.length]!
    commands['cycle-sphere'] = {
      id: 'cycle-sphere',
      label: 'sphere',
      group: 'view',
      key: ']',
      action: { type: 'set-sphere', sphereId: nextSphere.id },
    }
  }

  return commands
}
