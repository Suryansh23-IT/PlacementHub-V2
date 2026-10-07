import { useContext } from 'react'
import { PlacementCycleContext } from './PlacementCycleContext.jsx'

export function usePlacementCycle() {
  const context = useContext(PlacementCycleContext)
  if (!context) throw new Error('usePlacementCycle must be used inside PlacementCycleProvider.')
  return context
}
