import { createContext, useMemo, useState } from 'react'
import { PLACEMENT_CYCLES, persistPlacementCycle, readStoredPlacementCycle } from './placement-cycle.js'

export const PlacementCycleContext = createContext(null)

export function PlacementCycleProvider({ children }) {
  const [activeCycle, setActiveCycle] = useState(readStoredPlacementCycle)
  const value = useMemo(() => ({ activeCycle, cycle: PLACEMENT_CYCLES[activeCycle], cycles: Object.values(PLACEMENT_CYCLES), setActiveCycle: next => setActiveCycle(persistPlacementCycle(next)) }), [activeCycle])
  return <PlacementCycleContext.Provider value={value}>{children}</PlacementCycleContext.Provider>
}
