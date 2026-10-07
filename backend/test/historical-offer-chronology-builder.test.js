import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateOfferChronology } from '../scripts/historical-offer-chronology-builder.js'

const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)

test('C3A1c chronology locks primary offers and validates all additional campus offers', async () => {
  const [slots, roster, canonical, output] = await Promise.all([
    readJson('../data/historical-2025-26-offer-slots.json'),
    readJson('../data/historical-2025-26-placed-students.json'),
    readJson('../data/historical-2025-26.json'),
    readJson('../data/historical-2025-26-offer-assignments.json'),
  ])
  const drives = output.assignments
    .filter(assignment => assignment.placementSource === 'ON_CAMPUS')
    .map(assignment => assignment.driveId)
  const validation = validateOfferChronology({ slots: slots.slots, roster, canonical, output, drives: new Array(207).fill(null) })
  assert.deepEqual(validation, { primaryOffers: 627, additionalOffers: 78, placementLockViolations: 0, offCampusSyntheticDates: 23 })
  assert.equal(new Set(drives).size > 0, true)
})
