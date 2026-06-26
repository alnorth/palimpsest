import type { SphereId, AgendaId, ContextId } from './ids.js'
import type { Sphere, Agenda, Context } from './types.js'

export interface AgendaConfig {
  id: AgendaId
  title: string
  key?: string
}

export interface ContextConfig {
  id: ContextId
  name: string
  description?: string
}

export interface SphereConfig {
  id: SphereId
  name: string
  description?: string
  agendas: AgendaConfig[]
  contexts: ContextConfig[]
}

export function buildStateFromConfig(sphereConfigs: SphereConfig[]): {
  spheres: Map<SphereId, Sphere>
  agendas: Map<AgendaId, Agenda>
  contexts: Map<ContextId, Context>
} {
  const spheres = new Map<SphereId, Sphere>()
  const agendas = new Map<AgendaId, Agenda>()
  const contexts = new Map<ContextId, Context>()

  for (const sc of sphereConfigs) {
    spheres.set(sc.id, {
      id: sc.id,
      name: sc.name,
      ...(sc.description !== undefined && { description: sc.description }),
    })
    for (const ac of sc.agendas) {
      agendas.set(ac.id, { id: ac.id, sphereId: sc.id, title: ac.title, ...(ac.key !== undefined && { key: ac.key }) })
    }
    for (const cc of sc.contexts) {
      contexts.set(cc.id, {
        id: cc.id,
        sphereId: sc.id,
        name: cc.name,
        ...(cc.description !== undefined && { description: cc.description }),
      })
    }
  }

  return { spheres, agendas, contexts }
}

export const PALIMPSEST_CONFIG: SphereConfig[] = [
  {
    id: 'vialibri' as SphereId,
    name: 'viaLibri',
    agendas: [
      { id: 'agenda-jim'      as AgendaId, title: 'Jim',      key: 'j' },
      { id: 'agenda-marcia'   as AgendaId, title: 'Marcia',   key: 'm' },
      { id: 'agenda-nicolas'  as AgendaId, title: 'Nicolas',  key: 'n' },
      { id: 'agenda-anton'    as AgendaId, title: 'Anton',    key: 'a' },
      { id: 'agenda-dev'      as AgendaId, title: 'Dev',      key: 'd' },
      { id: 'agenda-showcase' as AgendaId, title: 'Showcase', key: 's' },
    ],
    contexts: [
      { id: 'ctx-marketing'  as ContextId, name: 'Marketing' },
      { id: 'ctx-accounting' as ContextId, name: 'Accounting' },
      { id: 'ctx-strategic'  as ContextId, name: 'Strategic' },
      { id: 'ctx-quick'      as ContextId, name: 'Quick' },
      { id: 'ctx-email'      as ContextId, name: 'Email' },
      { id: 'ctx-anytime'    as ContextId, name: 'Anytime' },
    ],
  },
  {
    id: 'personal' as SphereId,
    name: 'Personal',
    agendas: [
      { id: 'agenda-han' as AgendaId, title: 'Han', key: 'h' },
      { id: 'agenda-dad' as AgendaId, title: 'Dad', key: 'd' },
    ],
    contexts: [
      { id: 'ctx-phone'    as ContextId, name: 'Phone' },
      { id: 'ctx-laptop'   as ContextId, name: 'Laptop' },
      { id: 'ctx-tools'    as ContextId, name: 'Tools' },
      { id: 'ctx-sewing'   as ContextId, name: 'Sewing' },
      { id: 'ctx-no-tools' as ContextId, name: 'No tools' },
      { id: 'ctx-loft'     as ContextId, name: 'Loft' },
    ],
  },
]
