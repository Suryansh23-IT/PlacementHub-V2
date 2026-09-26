const legacyInstitutionNames = new Set([
  'national institute of technology raipur',
  'national institute of technology, raipur',
  'nit raipur',
  'nitrr',
])

export function displayInstitutionName(value) {
  const name = String(value || '').trim()
  return legacyInstitutionNames.has(name.toLowerCase()) ? 'Apex Institute of Technology' : name || 'Institution details unavailable'
}
