import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateSelectedApplicationPlan } from '../scripts/historical-selected-application-plan-builder.js'

const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)

test('C3A2a plans one complete selected application for every on-campus offer', async () => {
  const [assignments, slots, canonical, plan] = await Promise.all([
    readJson('../data/historical-2025-26-offer-assignments.json'),
    readJson('../data/historical-2025-26-offer-slots.json'),
    readJson('../data/historical-2025-26.json'),
    readJson('../data/historical-2025-26-selected-applications.json'),
  ])
  const validation = validateSelectedApplicationPlan({ assignments: assignments.assignments, slots: slots.slots, canonical, plan })
  assert.equal(validation.selectedApplications, 682)
  assert.equal(validation.offCampusApplications, 0)
  assert.equal(validation.phaseHistoryEvents, 2728)
  assert.deepEqual(plan.driveBlueprintSummary, { existingUsable: 207, requiresPlannedRepair: 0 })
})
