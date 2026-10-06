import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { exploreStudents, exportStudentExplorer, previewStudentExplorerNotification } = await import('../src/modules/students/student.service.js')
const lean = values => ({ lean: async () => values })

function createFixture(size = 2000) {
  const users = []; const profiles = []; const records = []; const applications = []
  for (let index = 0; index < size; index += 1) {
    const id = `${index}`.padStart(24, '0'); const branch = ['IT', 'CSE', 'ECE', 'ME'][index % 4]; const cgpa = 6 + (index % 41) / 10
    users.push({ _id: id, name: `Student ${index}`, email: `student${index}@example.test` })
    profiles.push({ userId: id, rollNumber: `AIT${String(index).padStart(4, '0')}`, branch, graduationYear: 2027 + (index % 2), cgpa, activeBacklogs: index % 9 === 0 ? 1 : 0, verificationStatus: index % 7 === 0 ? 'pending' : 'verified', updatedAt: new Date(2027, 0, 1 + (index % 27)) })
    if (index % 5 === 0) records.push({ studentId: id, companyId: 'c1', outcomeType: index % 10 === 0 ? 'ppo' : 'full_time', verificationState: 'confirmed' })
    applications.push({ studentId: id, placementDriveId: index % 2 === 0 ? 'd1' : 'd2', currentPhase: index % 6, currentStatus: index % 5 === 0 ? 'placement_confirmed' : 'active', updatedAt: new Date(2027, 1, 1 + (index % 27)) })
  }
  return { users, profiles, records, applications }
}

const fixture = createFixture()
const deps = {
  userModel: { find: () => ({ select: () => lean(fixture.users) }) }, profileModel: { find: () => lean(fixture.profiles) }, recordModel: { find: query => lean(fixture.records.filter(record => record.verificationState === query.verificationState)) }, applicationModel: { find: () => lean(fixture.applications) }, driveModel: { find: () => ({ select: () => lean([{ _id: 'd1', driveCode: 'DRV-1', role: { title: 'Engineer' } }, { _id: 'd2', driveCode: 'DRV-2', role: { title: 'Analyst' } }]) }) }, companyModel: { find: () => ({ select: () => lean([{ _id: 'c1', companyName: 'Acme' }]) }) }, institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027, 2028] } }),
}
const timings = []
async function timed(label, filters) { const started = performance.now(); const value = await exploreStudents(filters, deps); timings.push({ label, milliseconds: Math.round((performance.now() - started) * 10) / 10 }); return value }

test('Explorer practical 2000-student fixture returns only requested pages across representative queries', async () => {
  const queries = [
    ['no filters', { page: 1, limit: 50 }], ['name search', { search: 'Student 199', page: 1, limit: 50 }], ['roll search', { search: 'AIT0199', page: 1, limit: 50 }], ['IT branch', { branch: 'IT', page: 1, limit: 50 }], ['CPI >= 8', { minCpi: 8, page: 1, limit: 50 }], ['eligible unplaced', { collegeEligibility: 'eligible', placementStatus: 'unplaced_eligible', page: 1, limit: 50 }], ['company', { company: 'c1', page: 1, limit: 50 }], ['drive', { drive: 'd1', page: 1, limit: 50 }], ['phase', { phase: 3, page: 1, limit: 50 }], ['status', { applicationStatus: 'active', page: 1, limit: 50 }], ['outcome', { outcomeType: 'full_time', page: 1, limit: 50 }], ['CPI descending', { sortBy: 'cgpa', sortOrder: 'desc', page: 1, limit: 50 }], ['name ascending', { sortBy: 'name', page: 1, limit: 50 }], ['middle page', { page: 20, limit: 50 }], ['last page', { page: 40, limit: 50 }], ['group by branch', { groupBy: 'branch', page: 1, limit: 50 }],
  ]
  for (const [label, filters] of queries) { const result = await timed(label, filters); assert.ok(result.records.length <= 50); assert.ok(result.totalRecords <= 2000) }
  const grouped = await timed('group summary', { groupBy: 'branch', page: 1, limit: 50 }); assert.equal(grouped.groupSummary.reduce((total, group) => total + group.count, 0), 2000)
  const previewStart = performance.now(); const preview = await previewStudentExplorerNotification({ mode: 'all_matching', filters: { branch: 'IT' } }, deps); timings.push({ label: 'notification cohort preview', milliseconds: Math.round((performance.now() - previewStart) * 10) / 10 }); assert.equal(preview.recipientCount, 500)
  const exportStart = performance.now(); const exported = await exportStudentExplorer({ mode: 'all_matching', filters: { branch: 'IT' } }, deps); timings.push({ label: 'export all matching', milliseconds: Math.round((performance.now() - exportStart) * 10) / 10 }); assert.equal(exported.rowCount, 500)
  assert.ok(timings.every(item => item.milliseconds < 2000), JSON.stringify(timings))
  console.log(`M8C Explorer scale timings: ${JSON.stringify(timings)}`)
})
