import React, { useState } from 'react'
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
import { ViewPicker, AgendaPicker, ContextPicker, DueDatePicker, ProjectSearch, WaitingForPicker } from './components/Pickers.js'

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
    <Modal opened={opened} onClose={onClose} closeOnEscape={false} title={title} size="sm" styles={{ title: { fontFamily: 'monospace' } }} transitionProps={{ duration: 0 }}>
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
    view, mode, formValue, activeTask, activeProject,
    activeSphere, spheres, projectStats, listItems, currentTask, selectedProject,
    subtitle, projState, commands, dispatch, canGoBack, showCompleted, showArchived, showProject,
    syncState, searchQuery, activate, selectedItem,
  } = appState

  const [navDrawerOpen, setNavDrawerOpen] = useState(false)

  useUrlSync({ view, sphereId: activeSphere?.id, activeTaskId: activeTask?.id, activeProjectId: activeProject?.id, dispatch })
  useKeyboard(appState)

  const today = new Date().toISOString().slice(0, 10)

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
    content = <ViewPicker items={listItems.items} selectedItem={listItems.selectedItem} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-agenda-for-task') {
    content = <AgendaPicker items={listItems.items} selectedItem={listItems.selectedItem} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-context-for-task') {
    content = <ContextPicker items={listItems.items} selectedItem={listItems.selectedItem} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-due-date') {
    content = <DueDatePicker items={listItems.items} selectedItem={listItems.selectedItem} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-project-for-task') {
    content = (
      <ProjectSearch
        items={listItems.items}
        selectedItem={listItems.selectedItem}
        searchQuery={searchQuery}
        onSearchChange={v => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
        onHover={handleHover}
        onActivate={activate}
      />
    )
  } else if (listItems.view === 'picking-waiting-for-task') {
    content = <WaitingForPicker items={listItems.items} selectedItem={listItems.selectedItem} onHover={handleHover} onActivate={activate} />
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
          selectedItem={selectedItem}
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
        selectedItem={selectedItem}
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
  const exit = () => dispatch({ type: 'exit-mode' })
  const onChangeFormValue = (v: string) => dispatch({ type: 'update-mode', formValue: v })

  const modalProps = (() => {
    if (mode === undefined) return undefined
    switch (mode.type) {
      case 'adding':
        return {
          title: 'New task',
          onSubmit(v: string) {
            const trimmed = v.trim()
            if (!trimmed) { exit(); return }
            const projectId = view === 'project' ? activeProject?.id : undefined
            dispatch({ type: 'create-task', title: trimmed, ...(projectId !== undefined && { projectId }), ...(activeSphere !== undefined && { sphereId: activeSphere.id }) })
          },
        }
      case 'editing-task':
        return {
          title: taskTitle !== undefined ? `Edit — ${taskTitle}` : 'Edit task',
          onSubmit(v: string) {
            const trimmed = v.trim()
            if (trimmed && currentTask !== undefined) dispatch({ type: 'edit-task', taskId: currentTask.id, title: trimmed })
            else exit()
          },
        }
      case 'editing-description':
        return {
          title: taskTitle !== undefined ? `Description — ${taskTitle}` : 'Description',
          multiline: true as const,
          onSubmit(v: string) {
            if (currentTask !== undefined) dispatch({ type: 'edit-task-description', taskId: currentTask.id, description: v.trim() })
            else exit()
          },
        }
      case 'editing-due-date':
        return {
          title: taskTitle !== undefined ? `Due date — ${taskTitle}` : 'Due date',
          placeholder: 'tomorrow · next monday · jul 4 · 2026-12-25',
          preview: getDueDatePreview(formValue, today),
          onSubmit(v: string) {
            const parsed = parseDueDate(v, today)
            if (parsed !== null && currentTask !== undefined) dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: parsed })
          },
        }
      case 'editing-recurrence':
        return {
          title: taskTitle !== undefined ? `Recurrence — ${taskTitle}` : 'Recurrence',
          placeholder: 'daily · every monday · every 2 weeks · monthly',
          preview: getRecurrencePreview(formValue, today),
          onSubmit(v: string) {
            const trimmed = v.trim()
            if (currentTask === undefined) return
            if (trimmed === '') dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: CLEAR })
            else if (isValidExpression(trimmed)) dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: trimmed })
          },
        }
      case 'adding-project':
        return {
          title: 'New project',
          onSubmit(v: string) {
            const trimmed = v.trim()
            if (trimmed && activeSphere !== undefined) dispatch({ type: 'create-project', name: trimmed, sphereId: activeSphere.id })
            else exit()
          },
        }
      case 'editing-project':
        return {
          title: 'Edit project',
          onSubmit(v: string) {
            const trimmed = v.trim()
            if (trimmed && selectedProject !== undefined) dispatch({ type: 'edit-project', projectId: selectedProject.id, name: trimmed })
            else exit()
          },
        }
    }
  })()

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

      <FormModal
        opened={modalProps !== undefined}
        onClose={exit}
        value={formValue}
        onChange={onChangeFormValue}
        title={modalProps?.title ?? ''}
        onSubmit={modalProps?.onSubmit ?? exit}
        {...(modalProps?.placeholder !== undefined && { placeholder: modalProps.placeholder })}
        {...(modalProps?.preview !== undefined && { preview: modalProps.preview })}
        {...(modalProps?.multiline === true && { multiline: true })}
      />
    </AppShell>
  )
}
