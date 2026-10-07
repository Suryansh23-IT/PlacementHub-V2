import assert from 'node:assert/strict'
import test from 'node:test'
import { loadHistoricalCanonicalInput } from '../scripts/historical-seed-foundation.js'

test('C1 preserves 217 unique source rows and the approved reconciliation', async () => {
  const { input } = await loadHistoricalCanonicalInput()
  assert.equal(input.processes.length, 217)
  assert.equal(new Set(input.processes.map(process => process.sourceRow)).size, 217)
  assert.equal(input.processes.filter(process => process.placementSource === 'ON_CAMPUS').length, 207)
  assert.equal(input.processes.filter(process => process.placementSource === 'OFF_CAMPUS').length, 10)
  const zeroSelectionProcesses = input.processes.filter(process => Object.values(process.rawBranchOffers).reduce((sum, offers) => sum + offers, 0) === 0)
  assert.equal(zeroSelectionProcesses.length, 82)
  assert.equal(zeroSelectionProcesses.filter(process => process.placementSource === 'ON_CAMPUS').length, 81)
  assert.deepEqual(zeroSelectionProcesses.filter(process => process.placementSource === 'OFF_CAMPUS').map(process => process.sourceRow), [212])
  assert.deepEqual(input.reconciliation.deltaCanonicalMinusRaw, { Biomedical: -2, Biotechnology: 0, Chemical: 0, Civil: 0, CSE: 0, Electrical: 0, ECE: 0, IT: 2, Mechanical: 0, Metallurgical: 0, Mining: 0 })
})
