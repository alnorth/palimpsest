import type { SphereJson } from '@alnorth/palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSpheres } from './useSpheres'

export interface CurrentSphere {
  sphere: SphereJson | undefined
  spheres: SphereJson[]
  setSphere: (id: string | undefined) => void
}

export function useCurrentSphere(): CurrentSphere {
  const { currentSphereId, setCurrentSphere } = usePalimpsestContext()
  const { items: spheres } = useSpheres()
  const sphere = currentSphereId !== undefined ? spheres.find(s => s.id === currentSphereId) : undefined
  return { sphere, spheres, setSphere: setCurrentSphere }
}
