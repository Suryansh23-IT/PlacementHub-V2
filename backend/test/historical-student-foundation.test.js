import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import test from 'node:test'
import { buildHistoricalStudents, hashHistoricalDemoPassword, historicalBranches, normalizeHistoricalCompanies, normalizeHistoricalCompanyKey, summarizeHistoricalStudents } from '../scripts/historical-student-foundation.js'

test('M8.5B produces the exact eligible, offer, placed, and full-batch targets', () => {
  const students = buildHistoricalStudents()
  const summary = summarizeHistoricalStudents(students)
  assert.equal(students.length, 844)
  assert.equal(historicalBranches.reduce((sum, branch) => sum + branch.batchSize, 0), 985)
  assert.equal(historicalBranches.reduce((sum, branch) => sum + branch.offers, 0), 705)
  assert.equal(historicalBranches.reduce((sum, branch) => sum + branch.uniquePlaced, 0), 627)
  assert.equal(summary.reduce((sum, branch) => sum + branch.missingRolls, 0), 141)
  assert.deepEqual(summary.map(branch => branch.eligible), [32, 36, 63, 57, 92, 100, 100, 105, 87, 90, 82])
})

test('M8.5B identities are deterministic, unique, and drawn from full batch serials', () => {
  const first = buildHistoricalStudents()
  const second = buildHistoricalStudents()
  assert.deepEqual(first, second)
  assert.equal(new Set(first.map(student => student.rollNumber)).size, 844)
  assert.equal(new Set(first.map(student => student.email)).size, 844)
  for (const branch of historicalBranches) {
    const serials = first.filter(student => student.branchCode === branch.code).map(student => student.fullBatchSerial)
    assert.equal(serials.length, branch.eligible)
    assert.ok(Math.max(...serials) <= branch.batchSize)
    assert.ok(serials.some(serial => serial > branch.eligible), `${branch.code} must not simply use the first eligible serials`)
  }
})

test('M8.5B generated profiles meet the placement-ready academic baseline and reserve stable showcases', async () => {
  const students = buildHistoricalStudents()
  assert.ok(students.every(student => student.graduationYear === 2026 && student.verificationStatus === 'verified' && student.cgpa >= 6 && student.activeBacklogs === 0 && student.class10Score >= 60 && student.class12Score >= 60 && student.policyAcceptanceRequired && student.skills.length >= 4))
  const showcases = students.filter(student => student.showcaseScenario)
  assert.equal(showcases.length, 15)
  assert.equal(new Set(showcases.map(student => student.showcaseScenario)).size, 15)
  const hash = await hashHistoricalDemoPassword(10)
  assert.equal(await bcrypt.compare('12345678', hash), true)
})

test('M8.5B normalizes repeated companies into one future account identity', () => {
  assert.equal(normalizeHistoricalCompanyKey('Oracle India Private Limited'), 'oracle-india')
  const companies = normalizeHistoricalCompanies([{ companyName: 'Oracle India Private Limited' }, { companyName: 'Oracle India Pvt. Ltd.' }, { companyName: 'TCS Limited' }])
  assert.equal(companies.length, 2)
  assert.deepEqual(companies.map(company => company.email), ['oracle-india@placement.ait.ac.in', 'tcs@placement.ait.ac.in'])
})
