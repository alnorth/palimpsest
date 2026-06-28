import { Text } from '@mantine/core'
import type { Task, ProjectionState } from 'palimpsest'
import { getProject, getAgenda } from 'palimpsest'
import { PROJECT_PREFIX, AGENDA_PREFIX } from 'palimpsest-ui-core'

interface Props {
  task: Task
  flatIndex: number
  isSelected: boolean
  isMobile: boolean
  state: ProjectionState
  showProject?: boolean
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
  onComplete?: (task: Task) => void
}

export function TaskRow({ task, flatIndex, isSelected, isMobile, state, showProject, onHover, onActivate, onComplete }: Props) {
  const sel = isSelected && !isMobile
  const project = showProject && task.projectId !== undefined ? getProject(state, task.projectId) : undefined
  const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
  return (
    <Text
      size="sm"
      px="xs"
      py={2}
      {...(sel ? { c: 'blue' } : {})}
      onMouseEnter={() => onHover?.(flatIndex)}
      onClick={() => onActivate?.(flatIndex)}
      style={{
        background: sel ? 'var(--mantine-color-blue-light)' : undefined,
        borderRadius: 4,
        cursor: onActivate ? 'pointer' : 'default',
        fontFamily: 'monospace',
        userSelect: 'none',
      }}
    >
      <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{sel ? '>' : ''}</Text>
      {onComplete !== undefined && (
        <Text
          span
          c={task.status === 'completed' ? 'green' : 'dimmed'}
          onClick={(e) => { e.stopPropagation(); onComplete(task) }}
          style={{ cursor: 'pointer' }}
        >
          {task.status === 'completed' ? '● ' : '○ '}
        </Text>
      )}
      {task.isNext === true && <Text span c="yellow.6">{'→ '}</Text>}
      {task.isStarred === true && <Text span c="yellow.6">{'★ '}</Text>}
      {task.title}
      {project !== undefined && <Text span size="xs" c="dimmed">{' · '}{PROJECT_PREFIX}{project.name}</Text>}
      {agenda !== undefined && <Text span size="xs" c="dimmed">{' · '}{AGENDA_PREFIX}{agenda.title}</Text>}
      {task.dueDate !== undefined && <Text span size="xs" c="dimmed">{' · '}{task.dueDate}</Text>}
    </Text>
  )
}
