import { Text } from 'ink'
import type { Agenda } from 'palimpsest'
import { Row, Meta } from './Row.js'

interface Props {
  agenda: Agenda
  isSelected: boolean
  taskCount: number
}

export function AgendaRow({ agenda, isSelected, taskCount }: Props) {
  const title = (
    <>
      {agenda.title}
      {agenda.key !== undefined ? <Text dimColor>  {agenda.key}</Text> : null}
    </>
  )
  return (
    <Row isSelected={isSelected} color={isSelected ? 'blue' as const : undefined} title={title}>
      <Meta>{taskCount}</Meta>
    </Row>
  )
}
