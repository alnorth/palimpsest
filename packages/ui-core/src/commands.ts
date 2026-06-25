import { CLEAR } from 'palimpsest'
import type { Command } from './types.js'
import type { ViewModel } from './viewModel.js'

export function getCommands(vm: ViewModel): Command[] {
  const { view, mode, selected, currentTask, activeSphere, projects, showCompleted, showArchived, canGoBack, agendas, spheres } = vm
  const commands: Command[] = []

  if (mode !== 'list') return commands

  const isTopLevel = view === 'tasks' || view === 'projects'
  const isTaskContext = view === 'tasks' || view === 'project' || view === 'task'

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
  if ((view === 'project' || view === 'task') && currentTask?.status === 'open') {
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

  // ── Pick due date ────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-due-date',
      label: 'due date',
      group: 'state',
      key: 'u',
      action: { type: 'set-mode', mode: 'picking-due-date' },
    })
  }

  // ── Pick agenda ──────────────────────────────────────────────────────────────
  if (currentTask?.status === 'open') {
    commands.push({
      id: 'pick-agenda',
      label: 'agenda',
      group: 'state',
      key: 'a',
      action: { type: 'set-mode', mode: 'picking-agenda-for-task' },
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
        navState: {
          view: 'project',
          selected: 0,
          activeProjectId: currentTask.projectId,
          activeTaskId: undefined,
          showCompleted: false,
          showArchived: false,
        },
      },
    })
  }

  // ── Toggle completed ─────────────────────────────────────────────────────────
  if (view === 'tasks' || view === 'project') {
    commands.push({
      id: 'toggle-completed',
      label: showCompleted ? 'open' : 'completed',
      group: 'view',
      key: 'C',
      action: {
        type: 'navigate',
        navState: {
          view,
          selected: 0,
          activeProjectId: vm.activeProject?.id,
          activeTaskId: undefined,
          showCompleted: !showCompleted,
          showArchived,
        },
      },
    })
  }

  // ── Toggle archived ──────────────────────────────────────────────────────────
  if (view === 'projects') {
    commands.push({
      id: 'toggle-archived',
      label: showArchived ? 'active' : 'archived',
      group: 'view',
      key: 'X',
      action: {
        type: 'navigate',
        navState: {
          view: 'projects',
          selected: 0,
          activeProjectId: undefined,
          activeTaskId: undefined,
          showCompleted: false,
          showArchived: !showArchived,
        },
      },
    })
  }

  // ── Pick view ─────────────────────────────────────────────────────────────────
  if (isTopLevel) {
    commands.push({
      id: 'pick-view',
      label: 'view',
      group: 'view',
      key: 'v',
      action: { type: 'set-mode', mode: 'picking-view' },
    })
  }

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

  // ── Settings ─────────────────────────────────────────────────────────────────
  if (isTopLevel) {
    commands.push({
      id: 'settings',
      label: 'settings',
      group: 'view',
      key: 'k',
      action: { type: 'set-mode', mode: 'settings' },
    })
  }

  return commands
}
