import { CLEAR } from 'palimpsest'
import type { Command } from './types.js'
import type { TopLevelView } from './types.js'
import { VIEW_CONFIG } from './viewModel.js'
import type { ViewModel } from './viewModel.js'

export function getCommands(vm: ViewModel): Command[] {
  const { view, mode, selected, currentTask, activeSphere, projects, showCompleted, showArchived, canGoBack, agendas, contexts, spheres } = vm
  const commands: Command[] = []

  if (mode !== 'list') return commands

  const isTopLevel = view === 'dashboard' || view === 'tasks' || view === 'projects'

  // ── Add task ─────────────────────────────────────────────────────────────────
  if ((view === 'tasks' || view === 'project') && !showCompleted) {
    commands.push({
      id: 'add-task',
      label: 'new',
      group: 'state',
      key: 'q',
      action: { type: 'set-mode', mode: 'adding' },
    })
  }

  // ── Add project ───────────────────────────────────────────────────────────────
  if (view === 'projects' && !showArchived) {
    commands.push({
      id: 'add-project',
      label: 'new',
      group: 'state',
      key: 'q',
      action: { type: 'set-mode', mode: 'adding-project' },
    })
  }

  // ── Edit task title ──────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'edit-task',
      label: 'edit',
      group: 'state',
      key: 'e',
      action: { type: 'set-mode', mode: 'editing-task' },
    })
  }

  // ── Edit task description ────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'edit-description',
      label: 'description',
      group: 'state',
      key: 'd',
      action: { type: 'set-mode', mode: 'editing-description' },
    })
  }

  // ── Edit project name ────────────────────────────────────────────────────────
  if (view === 'projects' && !showArchived && projects[selected] !== undefined) {
    commands.push({
      id: 'edit-project',
      label: 'edit',
      group: 'state',
      key: 'e',
      action: { type: 'set-mode', mode: 'editing-project' },
    })
  }

  // ── Complete / uncomplete task ───────────────────────────────────────────────
  if (currentTask !== undefined) {
    if (currentTask.status === 'open') {
      commands.push({
        id: 'complete-task',
        label: 'complete',
        group: 'state',
        key: 'c',
        action: { type: 'complete-task', taskId: currentTask.id },
      })
    } else {
      commands.push({
        id: 'uncomplete-task',
        label: 'reopen',
        group: 'state',
        key: 'c',
        action: { type: 'uncomplete-task', taskId: currentTask.id },
      })
    }
  }

  // ── Toggle next ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open' && currentTask.projectId !== undefined) {
    commands.push({
      id: 'toggle-next',
      label: 'next',
      group: 'state',
      key: 'n',
      action: { type: 'toggle-next', taskId: currentTask.id },
    })
  }

  // ── Toggle starred ───────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'star',
      label: 'star',
      group: 'state',
      key: 's',
      action: { type: 'toggle-starred', taskId: currentTask.id },
    })
  }

  // ── Toggle waiting ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'toggle-waiting',
      label: 'waiting',
      group: 'state',
      key: 'w',
      action: { type: 'toggle-waiting', taskId: currentTask.id },
    })
  }

  // ── Pick due date ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-due-date',
      label: 'due date',
      group: 'state',
      key: 'u',
      action: {
        type: 'navigate',
        navState: { view: 'picking-due-date', selected: 0, activeTaskId: currentTask.id },
      },
    })
  }

  // ── Set recurrence ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'set-recurrence',
      label: 'recurring',
      group: 'state',
      key: 'r',
      action: { type: 'set-mode', mode: 'editing-recurrence' },
    })
  }

  // ── Pick project ─────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-project',
      label: 'project',
      group: 'state',
      key: 'p',
      action: {
        type: 'navigate',
        navState: { view: 'picking-project-for-task', selected: 0, activeTaskId: currentTask.id, searchQuery: '' },
      },
    })
  }

  // ── Pick agenda ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-agenda',
      label: 'agenda',
      group: 'state',
      key: 'a',
      action: {
        type: 'navigate',
        navState: { view: 'picking-agenda-for-task', selected: 0, activeTaskId: currentTask.id },
      },
    })
  }

  // ── Pick context ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-context',
      label: 'context',
      group: 'state',
      key: 'k',
      action: {
        type: 'navigate',
        navState: { view: 'picking-context-for-task', selected: 0, activeTaskId: currentTask.id },
      },
    })
  }

  // ── Archive / unarchive project ──────────────────────────────────────────────
  if (view === 'projects' && projects[selected] !== undefined) {
    const proj = projects[selected]!
    commands.push({
      id: proj.isArchived ? 'unarchive-project' : 'archive-project',
      label: proj.isArchived ? 'unarchive' : 'archive',
      group: 'state',
      key: 'x',
      action: proj.isArchived
        ? { type: 'unarchive-project', projectId: proj.id }
        : { type: 'archive-project', projectId: proj.id },
    })
  }

  // ── View project (from task) ─────────────────────────────────────────────────
  if (currentTask?.projectId !== undefined) {
    commands.push({
      id: 'view-project',
      label: 'view project',
      group: 'view',
      key: 'P',
      action: {
        type: 'navigate',
        navState: { view: 'project', selected: 0, activeProjectId: currentTask.projectId, showCompleted: false, showArchived: false },
      },
    })
  }

  // ── Toggle completed ─────────────────────────────────────────────────────────
  if (view === 'tasks') {
    commands.push({
      id: 'toggle-completed',
      label: showCompleted ? 'open' : 'completed',
      group: 'view',
      key: 'C',
      action: { type: 'navigate', navState: { view: 'tasks', selected: 0, showCompleted: !showCompleted, showArchived } },
    })
  }
  if (view === 'project' && vm.activeProject !== undefined) {
    commands.push({
      id: 'toggle-completed',
      label: showCompleted ? 'open' : 'completed',
      group: 'view',
      key: 'C',
      action: { type: 'navigate', navState: { view: 'project', selected: 0, activeProjectId: vm.activeProject.id, showCompleted: !showCompleted, showArchived: false } },
    })
  }

  // ── Toggle archived ──────────────────────────────────────────────────────────
  if (view === 'projects') {
    commands.push({
      id: 'toggle-archived',
      label: showArchived ? 'active' : 'archived',
      group: 'view',
      key: 'X',
      action: { type: 'navigate', navState: { view: 'projects', selected: 0, showCompleted: false, showArchived: !showArchived } },
    })
  }

  // ── Pick view ─────────────────────────────────────────────────────────────────
  commands.push({
    id: 'pick-view',
    label: 'view',
    group: 'view',
    key: 'v',
    action: {
      type: 'navigate',
      navState: { view: 'picking-view', selected: Math.max(0, VIEW_CONFIG.findIndex(item => item.id === view)) },
    },
  })

  // ── Cycle sphere ─────────────────────────────────────────────────────────────
  if (isTopLevel && spheres.length > 0) {
    const sphereIdx = spheres.findIndex(s => s.id === activeSphere?.id)
    const nextSphere = spheres[(sphereIdx + 1) % spheres.length]!
    commands.push({
      id: 'cycle-sphere',
      label: 'sphere',
      group: 'view',
      key: ']',
      action: { type: 'set-sphere', sphereId: nextSphere.id },
    })
  }

  return commands
}
