export const DEFAULT_PLACEMENT_CYCLE = '2027'
export const PLACEMENT_CYCLE_STORAGE_KEY = 'placementhub_active_cycle'

export function createPlacementCycleConfig({ api2026, api2027, archiveEnabled = true }) {
  const cycles = Object.freeze({
    ...(archiveEnabled ? { '2026': { id: '2026', label: 'Placement Cycle 2026', status: 'Archived', apiUrl: api2026 } } : {}),
    '2027': { id: '2027', label: 'Placement Cycle 2027', status: 'Current', apiUrl: api2027 },
  })
  const isCycle = value => Object.hasOwn(cycles, value)
  const normalize = value => isCycle(value) ? value : DEFAULT_PLACEMENT_CYCLE
  return { cycles, isCycle, normalize, sessionKey: cycle => `placementhub_auth_${normalize(cycle)}` }
}
