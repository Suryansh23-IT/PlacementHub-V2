import assert from 'node:assert/strict'
import test from 'node:test'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { reconcileHistoricalApplicationGraph } from '../scripts/reconcile-historical-application-graph.js'

test('C3C live historical database reconciles to the locked reconstruction', async () => {
  await connectDatabase()
  try {
    const result = await reconcileHistoricalApplicationGraph()
    assert.equal(result.applications, 11348)
    assert.equal(result.phaseHistoryEvents, 33809)
    assert.equal(result.placementRecords, 705)
    assert.equal(result.uniquePlaced, 627)
    assert.deepEqual(result.statusCounts, { selected: 682, rejected: 7436, absent: 2121, withdrawn: 1109 })
  } finally {
    await disconnectDatabase()
  }
})
