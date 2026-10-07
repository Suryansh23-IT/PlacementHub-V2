import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateApplicationGraphPlan } from '../scripts/historical-application-graph-plan-builder.js'

const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)

test('C3B graph plan reconciles all selected and unsuccessful application journeys', async () => {
  const [roster, assignments, selectedPlan, canonical, plan] = await Promise.all([
    readJson('../data/historical-2025-26-placed-students.json'),
    readJson('../data/historical-2025-26-offer-assignments.json'),
    readJson('../data/historical-2025-26-selected-applications.json'),
    readJson('../data/historical-2025-26.json'),
    readJson('../data/historical-2025-26-application-graph-plan.json'),
  ])
  const validation = validateApplicationGraphPlan({ roster, assignments: assignments.assignments, selectedPlan, canonical, plan })
  assert.equal(validation.statuses.selected, 682)
  assert.equal(plan.driveFunnels.length, 207)
  assert.equal(validation.unsuccessfulApplications > 0, true)
})
