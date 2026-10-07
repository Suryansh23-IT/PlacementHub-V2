import { createPlacementCycleConfig, DEFAULT_PLACEMENT_CYCLE, PLACEMENT_CYCLE_STORAGE_KEY } from './placement-cycle-core.js'

const config = createPlacementCycleConfig({ api2026: import.meta.env.VITE_API_URL_2026 ?? 'http://localhost:5000/api/v1', api2027: import.meta.env.VITE_API_URL_2027 ?? 'http://localhost:5001/api/v1' })
export const PLACEMENT_CYCLES = config.cycles
export { DEFAULT_PLACEMENT_CYCLE, PLACEMENT_CYCLE_STORAGE_KEY }
export const isPlacementCycle = config.isCycle
export const normalizePlacementCycle = config.normalize
export const sessionStorageKeyForCycle = config.sessionKey

export function readStoredPlacementCycle(storage = localStorage) {
  return normalizePlacementCycle(storage.getItem(PLACEMENT_CYCLE_STORAGE_KEY))
}

export function persistPlacementCycle(cycle, storage = localStorage) {
  const normalized = normalizePlacementCycle(cycle)
  storage.setItem(PLACEMENT_CYCLE_STORAGE_KEY, normalized)
  return normalized
}

export function activePlacementCycle() {
  return readStoredPlacementCycle()
}

export function apiUrlForPlacementCycle(cycle) {
  return PLACEMENT_CYCLES[normalizePlacementCycle(cycle)].apiUrl
}
