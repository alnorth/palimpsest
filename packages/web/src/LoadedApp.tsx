import React, { useState, useEffect } from 'react'
import { AppShell, Group, Text, ScrollArea, Badge, Burger, Button, Stack, Modal, TextInput, Textarea } from '@mantine/core'
import type { PalimpsestStore, ProjectionState, Task } from 'palimpsest'
import { CLEAR, isValidExpression } from 'palimpsest'
import { useAppState, parseDueDate, getDueDatePreview, getRecurrencePreview } from 'palimpsest-ui-core'
import type { Command } from 'palimpsest-ui-core'
import { CommandButton } from './components/CommandButton.js'
import { useKeyboard } from './useKeyboard.js'
import { useUrlSync } from './useUrlSync.js'
import { ItemList } from './components/ItemList.js'
import { TaskDetail } from './components/TaskDetail.js'
import { CommandBar } from './components/CommandBar.js'
import { MobileFooter } from './components/MobileFooter.js'
import { NavDrawer } from './components/NavDrawer.js'
import { SyncStatus } from './components/SyncStatus.js'
import { ViewPicker, AgendaPicker, ContextPicker, DueDatePicker, ProjectSearch } from './components/Pickers.js'

interface Props {
  store: PalimpsestStore
  initialState: ProjectionState
}

function FormModal({ opened, onClose, title, placeholder, preview, value, onChange, onSubmit, multiline }: {
  opened: boolean
  onClose: () => void
  title: string
  placeholder?: string
  preview?: { text: string; ok: boolean } | undefined
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  multiline?: boolean
}) {
  const submitDisabled = preview !== undefined && !preview.ok
  const inputStyles = { fontFamily: 'monospace', ...(preview !== undefined && { borderColor: preview.ok ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }) }
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" styles={{ title: { fontFamily: 'monospace' } }} transitionProps={{ duration: 0 }}>
      {multiline ? (
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.currentTarget.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { onSubmit(value); e.preventDefault() } }}
          autoFocus
          size="sm"
          minRows={3}
          autosize
          styles={{ input: inputStyles }}
        />
      ) : (
        <TextInput
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSubmit(value); e.preventDefault() } }}
          autoFocus
          size="sm"
          styles={{ input: inputStyles }}
        />
      )}
      {preview !== undefined && (
        <Text size="sm" c={preview.ok ? 'green' : 'red'} mt="xs" style={{ fontFamily: 'monospace' }}>→ {preview.text}</Text>
      )}
      <Group justify="flex-end" mt="sm">
        {multiline && <Text size="xs" c="dimmed" visibleFrom="sm">Ctrl+Enter to save</Text>}
        <Button size="xs" disabled={submitDisabled} onClick={() => onSubmit(value)}>Save</Button>
      </Group>
    </Modal>
  )
}

export function LoadedApp({ store, initialState }: Props) {
  const appState = useAppState(store, initialState)
  const {
    view, mode, selected, activeTask, activeProject,
    activeSphere, spheres, projectStats, listItems, currentTask,
    subtitle, projState, commands, dispatch, canGoBack, showCompleted, showArchived, showProject,
    syncState, searchQuery, activate,
  } = appState

  const [formValue, setFormValue] = useState('')
  const [navDrawerOpen, setNavDrawerOpen] = useState(false)
  // Prepopulate the form when entering an editing mode (e.g. via button click in TaskDetail)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'editing-task') {
      setFormValue(currentTask?.title ?? '')
    } else if (mode === 'editing-description') {
      setFormValue(currentTask?.description ?? '')
    } else if (mode === 'editing-recurrence') {
      setFormValue(currentTask?.dueDateExpression ?? '')
    } else if (mode === 'editing-project') {
      const item = listItems.items[selected]
      setFormValue(item !== undefined && 'kind' in item && item.kind === 'project' ? item.project.name : '')
    }
  }, [mode]) // intentionally omit other deps — we only want to run on mode transitions

  useUrlSync({ view, sphereId: activeSphere?.id, activeTaskId: activeTask?.id, activeProjectId: activeProject?.id, dispatch })
  useKeyboard(appState, setFormValue)

  const today = new Date().toISOString().slice(0, 10)

  function dismissModal() {
    dispatch({ type: 'set-mode', mode: 'list' })
    setFormValue('')
  }

  function handleTaskSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed) {
      const projectId = view === 'project' ? activeProject?.id : undefined
      dispatch({
        type: 'create-task',
        title: trimmed,
        ...(projectId !== undefined && { projectId }),
        ...(activeSphere !== undefined && { sphereId: activeSphere.id }),
      })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed && currentTask !== undefined) {
      dispatch({ type: 'edit-task', taskId: currentTask.id, title: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditDescriptionSubmit(description: string) {
    if (currentTask !== undefined) {
      dispatch({ type: 'edit-task-description', taskId: currentTask.id, description: description.trim() })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleDueDateSubmit(value: string) {
    const parsed = parseDueDate(value, today)
    if (parsed !== null && currentTask !== undefined) {
      dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: parsed })
      dispatch({ type: 'set-mode', mode: 'list' })
      setFormValue('')
    }
  }

  function handleRecurrenceSubmit(value: string) {
    const trimmed = value.trim()
    if (currentTask === undefined) return
    if (trimmed === '') {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: CLEAR })
      setFormValue('')
    } else if (isValidExpression(trimmed)) {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: trimmed })
      setFormValue('')
    }
  }

  function handleProjectSubmit(name: string) {
    const trimmed = name.trim()
    if (trimmed && activeSphere !== undefined) {
      dispatch({ type: 'create-project', name: trimmed, sphereId: activeSphere.id })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditProjectSubmit(name: string) {
    const trimmed = name.trim()
    const selectedItem = listItems.items[selected]
    const project = selectedItem !== undefined && 'kind' in selectedItem && selectedItem.kind === 'project' ? selectedItem.project : undefined
    if (trimmed && project !== undefined) {
      dispatch({ type: 'edit-project', projectId: project.id, name: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleHover(i: number) {
    dispatch({ type: 'update-nav', patch: { selected: i } })
  }

  function handleTaskComplete(task: Task) {
    if (task.status === 'open') {
      dispatch({ type: 'complete-task', taskId: task.id })
    } else {
      dispatch({ type: 'uncomplete-task', taskId: task.id })
    }
  }

  const toggleCmd = commands['toggle-completed'] ?? commands['toggle-archived']

  const titleText = view.startsWith('picking-')
    ? subtitle
    : `${activeSphere?.name ?? 'Palimpsest'} — ${subtitle}`

  let content: React.ReactNode

  if (listItems.view === 'picking-view') {
    content = <ViewPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-agenda-for-task') {
    content = <AgendaPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-context-for-task') {
    content = <ContextPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-due-date') {
    content = <DueDatePicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-project-for-task') {
    content = (
      <ProjectSearch
        items={listItems.items}
        selected={selected}
        searchQuery={searchQuery}
        onSearchChange={v => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
        onHover={handleHover}
        onActivate={activate}
      />
    )
  } else if (listItems.view === 'task' && activeTask !== undefined) {
    content = <TaskDetail task={activeTask} state={projState} commands={commands} dispatch={dispatch} />
  } else if (listItems.view === 'project') {
    const stateCommands = (Object.values(commands) as Command[]).filter(c => c.group === 'state')
    content = (
      <Stack gap="sm">
        {stateCommands.length > 0 && (
          <Group gap="xs">
            {stateCommands.map(c => (
              <CommandButton key={c.id} command={c} dispatch={dispatch} />
            ))}
          </Group>
        )}
        <ItemList
          groups={listItems.groups}
          selected={selected}
          state={projState}
          projectStats={projectStats}
          showArchived={showArchived}
          emptyMessage={listItems.emptyMessage}
          onHover={handleHover}
          onActivate={activate}
          onComplete={handleTaskComplete}
        />
      </Stack>
    )
  } else if (listItems.view === 'dashboard' || listItems.view === 'tasks' || listItems.view === 'projects' || listItems.view === 'processing') {
    content = (
      <ItemList
        groups={listItems.groups}
        selected={selected}
        state={projState}
        projectStats={projectStats}
        showArchived={showArchived}
        emptyMessage={listItems.emptyMessage}
        onHover={handleHover}
        onActivate={activate}
        onComplete={handleTaskComplete}
        {...(showProject ? { showProject } : {})}
      />
    )
  } else {
    content = activeSphere === undefined
      ? <Text c="dimmed" size="sm">No spheres configured.</Text>
      : null
  }

  const taskTitle = currentTask?.title

  const dueDatePreview = mode === 'editing-due-date' ? getDueDatePreview(formValue, today) : undefined
  const recurrencePreview = mode === 'editing-recurrence' ? getRecurrencePreview(formValue, today) : undefined

  return (
    <AppShell
      header={{ height: 50 }}
      footer={{ height: { base: 50, sm: 44 } }}
      padding="md"
      styles={{
        main: { fontFamily: 'monospace' },
        header: { fontFamily: 'monospace' },
        footer: { fontFamily: 'monospace' },
      }}
    >
      <NavDrawer
        opened={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
        spheres={spheres}
        activeSphere={activeSphere}
        currentView={view}
        dispatch={dispatch}
      />
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <Burger opened={navDrawerOpen} onClick={() => setNavDrawerOpen(o => !o)} size="sm" />
            <Text fw={700}>{titleText}</Text>
          </Group>
          <Group gap="sm">
            {toggleCmd !== undefined && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => dispatch(toggleCmd.action)}
                style={{ fontFamily: 'monospace' }}
              >
                {toggleCmd.label}
              </Button>
            )}
            {showCompleted && view !== 'projects' && <Badge color="yellow" variant="light">completed</Badge>}
            {showArchived && view === 'projects' && <Badge color="yellow" variant="light">archived</Badge>}
            <SyncStatus syncState={syncState} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <ScrollArea h="100%">
          {content}
        </ScrollArea>
      </AppShell.Main>

      <AppShell.Footer px="md" py="sm">
        <CommandBar commands={commands} canGoBack={canGoBack} />
        <MobileFooter commands={commands} dispatch={dispatch} />
      </AppShell.Footer>

      <FormModal opened={mode === 'adding'} onClose={dismissModal} title="New task" value={formValue} onChange={setFormValue} onSubmit={handleTaskSubmit} />
      <FormModal opened={mode === 'editing-task'} onClose={dismissModal} title={taskTitle !== undefined ? `Edit — ${taskTitle}` : 'Edit task'} value={formValue} onChange={setFormValue} onSubmit={handleEditSubmit} />
      <FormModal opened={mode === 'editing-description'} onClose={dismissModal} title={taskTitle !== undefined ? `Description — ${taskTitle}` : 'Description'} value={formValue} onChange={setFormValue} onSubmit={handleEditDescriptionSubmit} multiline />
      <FormModal opened={mode === 'editing-due-date'} onClose={dismissModal} title={taskTitle !== undefined ? `Due date — ${taskTitle}` : 'Due date'} placeholder="tomorrow · next monday · jul 4 · 2026-12-25" preview={dueDatePreview} value={formValue} onChange={setFormValue} onSubmit={handleDueDateSubmit} />
      <FormModal opened={mode === 'editing-recurrence'} onClose={dismissModal} title={taskTitle !== undefined ? `Recurrence — ${taskTitle}` : 'Recurrence'} placeholder="daily · every monday · every 2 weeks · monthly" preview={recurrencePreview} value={formValue} onChange={setFormValue} onSubmit={handleRecurrenceSubmit} />
      <FormModal opened={mode === 'adding-project'} onClose={dismissModal} title="New project" value={formValue} onChange={setFormValue} onSubmit={handleProjectSubmit} />
      <FormModal opened={mode === 'editing-project'} onClose={dismissModal} title="Edit project" value={formValue} onChange={setFormValue} onSubmit={handleEditProjectSubmit} />
    </AppShell>
  )
}
