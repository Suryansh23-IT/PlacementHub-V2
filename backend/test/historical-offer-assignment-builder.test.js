import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateOfferAssignments } from '../scripts/historical-offer-assignment-builder.js'

const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)

test('C3A1b Step 2 maps every offer slot to the fixed roster without duplicate processes', async () => {
  const [slots, roster, canonical, output] = await Promise.all([
    readJson('../data/historical-2025-26-offer-slots.json'),
    readJson('../data/historical-2025-26-placed-students.json'),
    readJson('../data/historical-2025-26.json'),
    readJson('../data/historical-2025-26-offer-assignments.json'),
  ])
  const validation = validateOfferAssignments({ slots: slots.slots, roster, canonical, output })
  assert.deepEqual(validation.distribution, { oneOffer: 550, twoOffers: 76, threeOffers: 1 })
  assert.equal(output.assignments.length, 705)
})
