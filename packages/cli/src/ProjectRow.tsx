import type { Project } from 'palimpsest'
import type { ProjectStats } from 'palimpsest-ui-core'
import { Row, Meta } from './Row.js'
import { formatDate } from './format.js'

interface Props {
  project: Project
  isSelected: boolean
  projectStats: ProjectStats
  showArchived?: boolean
}

export function ProjectRow({ project, isSelected, projectStats, showArchived = false }: Props) {
  const hasNext = projectStats.hasNext.has(project.id)
  const count = projectStats.taskCount.get(project.id) ?? 0
  const color = isSelected ? 'blue' as const : (!showArchived && !hasNext ? 'red' as const : undefined)
  return (
    <Row isSelected={isSelected} color={color} title={project.name}>
      {project.archivedAt !== undefined ? <Meta>{formatDate(project.archivedAt)}</Meta> : null}
      <Meta>{count}</Meta>
    </Row>
  )
}
