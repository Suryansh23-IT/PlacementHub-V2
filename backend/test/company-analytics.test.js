import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { exportCompanyCandidateExplorer, getCompanyAnalytics, getCompanyCandidateExplorer } = await import('../src/modules/analytics/company-analytics.service.js')
const lean = values => ({ lean: async () => values })
const company = { _id: 'c1', userId: 'company-a', approvalStatus: 'approved' }
const drives = [{ _id: 'd1', companyId: 'c1', lifecycleStatus: 'published', role: { title: 'Engineer' }, phases: [{ phaseNumber: 1, title: 'Assessment' }, { phaseNumber: 2, title: 'Interview' }] }, { _id: 'd2', companyId: 'c2', lifecycleStatus: 'published', role: { title: 'Private' }, phases: [{ phaseNumber: 1, title: 'Private phase' }] }]
const applications = [{ _id: 'a1', studentId: 's1', placementDriveId: 'd1', currentPhase: 2, currentStatus: 'active', updatedAt: new Date('2027-01-03'), phaseHistory: [{ phase: 0, status: 'applied', event: 'applied' }, { phase: 1, status: 'active', event: 'advanced' }, { phase: 2, status: 'active', event: 'advanced' }] }, { _id: 'a2', studentId: 's2', placementDriveId: 'd1', currentPhase: 1, currentStatus: 'rejected', updatedAt: new Date('2027-01-02'), phaseHistory: [{ phase: 0, status: 'applied', event: 'applied' }, { phase: 1, status: 'rejected', event: 'rejected' }] }, { _id: 'a3', studentId: 's3', placementDriveId: 'd2', currentPhase: 1, currentStatus: 'active', phaseHistory: [] }]
const records = [{ applicationId: 'a1', studentId: 's1', companyId: 'c1', verificationState: 'confirmed', outcomeType: 'full_time' }, { applicationId: 'a3', studentId: 's3', companyId: 'c2', verificationState: 'confirmed', outcomeType: 'ppo' }]
const dependencies = { companyModel: { findOne: async query => query.userId === 'company-a' ? company : null }, placementDriveModel: { find: query => lean(drives.filter(drive => drive.companyId === query.companyId)) }, applicationModel: { find: query => lean(applications.filter(app => query.placementDriveId.$in.includes(app.placementDriveId))) }, placementRecordModel: { find: query => lean(records.filter(record => record.companyId === query.companyId)) }, userModel: { find: () => ({ select: () => lean([{ _id: 's1', name: 'Asha', email: 'asha@example.test' }, { _id: 's2', name: 'Bharat', email: 'bharat@example.test' }]) }) }, profileModel: { find: () => ({ select: () => lean([{ userId: 's1', rollNumber: 'IT1', branch: 'IT', cgpa: 9, activeBacklogs: 0, graduationYear: 2027 }, { userId: 's2', rollNumber: 'CS1', branch: 'CSE', cgpa: 8, activeBacklogs: 1, graduationYear: 2027 }]) }) } }

test('Company candidate explorer enforces ownership and supports search, filters, grouping, sort, and pagination', async () => {
  const result = await getCompanyCandidateExplorer('company-a', { search: 'asha', sortBy: 'cgpa', sortOrder: 'desc', groupBy: 'branch', page: 1, limit: 25 }, dependencies)
  assert.deepEqual([result.totalRecords, result.records.map(row => row.id), result.groupSummary], [1, ['a1'], [{ label: 'IT', count: 1 }]])
  const all = await getCompanyCandidateExplorer('company-a', { drive: 'd1', phase: 1, status: 'rejected', page: 1, limit: 50 }, dependencies)
  assert.equal(all.records[0].id, 'a2'); assert.equal('notes' in all.records[0], false); assert.equal(all.records.some(row => row.id === 'a3'), false)
  await assert.rejects(getCompanyCandidateExplorer('company-b', { page: 1, limit: 50 }, dependencies), error => error.errorCode === 'FORBIDDEN')
})

test('Company analytics keeps inactive statuses out of active candidates and reports dynamic phases', async () => {
  const result = await getCompanyAnalytics('company-a', {}, dependencies)
  assert.deepEqual(result.kpis, { totalDrives: 1, activeDrives: 1, completedDrives: 0, totalApplications: 2, activeCandidates: 1, provisionalSelected: 0, offersReceived: 1, confirmationPending: 0, confirmedOffers: 1, confirmedPlacements: 1, withdrawn: 0, rejected: 1, absent: 0 })
  assert.deepEqual(result.drives[0].phaseAnalytics.map(phase => phase.title), ['Phase 0', 'Assessment', 'Interview'])
})

test('Company export contains only owned filtered candidate rows', async () => {
  const exported = await exportCompanyCandidateExplorer('company-a', { branch: 'IT' }, dependencies)
  assert.equal(exported.rowCount, 1); assert.match(exported.filename, /company-candidates/)
  const current = await exportCompanyCandidateExplorer('company-a', { page: 1, limit: 1, exportMode: 'current_view' }, dependencies)
  assert.equal(current.rowCount, 1)
})
