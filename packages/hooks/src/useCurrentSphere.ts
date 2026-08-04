import type { SphereJson } from 'palimpsest-query'
import { usePalimpsestContext } from './PalimpsestProvider.js'
import { useSpheres } from './useSpheres.js'

export interface CurrentSphere {
  sphere: SphereJson | undefined
  spheres: SphereJson[]
  setSphere: (id: string | undefined) => void
}

export function useCurrentSphere(): CurrentSphere {
  const { currentSphereId, setCurrentSphere } = usePalimpsestContext()
  const { data } = useSpheres()
  const spheres = data ?? []
  const sphere = currentSphereId !== undefined ? spheres.find(s => s.id === currentSphereId) : undefined
  return { sphere, spheres, setSphere: setCurrentSphere }
}
