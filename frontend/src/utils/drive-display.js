export function stableDriveCode(placementDriveId) {
  const value = String(placementDriveId || '').replace(/[^a-f\d]/gi, '')
  return value ? `DRV-${value.slice(-8).toUpperCase()}` : ''
}
