import type { Agenda } from 'palimpsest'
import { Row, Meta } from './Row.js'

interface Props {
  agenda: Agenda
  isSelected: boolean
  taskCount: number
}

export function AgendaRow({ agenda, isSelected, taskCount }: Props) {
  return (
    <Row isSelected={isSelected} color={isSelected ? 'blue' as const : undefined} title={agenda.title}>
      <Meta>{taskCount}</Meta>
    </Row>
  )
}
