import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { getAdminAnalyticsDashboard, getAdminAnalyticsSummary, isCollegePlacementEligible, packageStatistics } = await import('../src/modules/analytics/analytics.service.js')

const profiles = [
  { userId: 's1', verificationStatus: 'verified', cgpa: 8.5, activeBacklogs: 0, graduationYear: 2027, branch: 'CSE' },
  { userId: 's2', verificationStatus: 'verified', cgpa: 7.1, activeBacklogs: 0, graduationYear: 2027, branch: 'IT' },
  { userId: 's3', verificationStatus: 'verified', cgpa: 6.9, activeBacklogs: 0, graduationYear: 2027, branch: 'IT' },
  { userId: 's4', verificationStatus: 'pending', cgpa: 9, activeBacklogs: 0, graduationYear: 2027, branch: 'CSE' },
  { userId: 's5', verificationStatus: 'verified', cgpa: 8, activeBacklogs: 1, graduationYear: 2027, branch: 'CSE' },
]

const records = [
  { studentId: 's1', verificationState: 'confirmed', outcomeType: 'full_time', adminVerifiedAt: new Date('2027-09-10T10:00:00Z'), package: { amount: 1200000, currency: 'INR', period: 'per_annum' } },
  { studentId: 's1', verificationState: 'confirmed', outcomeType: 'ppo', adminVerifiedAt: new Date('2027-09-12T10:00:00Z'), package: { amount: 1000000, currency: 'INR', period: 'per_annum' } },
  { studentId: 's2', verificationState: 'confirmed', outcomeType: 'internship', adminVerifiedAt: new Date('2027-09-12T10:00:00Z'), package: { amount: 50000, currency: 'INR', period: 'per_month' } },
  { studentId: 's3', verificationState: 'revoked', outcomeType: 'full_time', adminVerifiedAt: new Date('2027-09-12T10:00:00Z'), package: { amount: 1500000, currency: 'INR', period: 'per_annum' } },
]

const profileFind = query => profiles.filter(profile => (query.branch == null || profile.branch === query.branch) && (query.graduationYear == null || profile.graduationYear === query.graduationYear))
const recordFind = query => records.filter(record => {
  if (record.verificationState !== query.verificationState) return false
  if (query.outcomeType?.$in && !query.outcomeType.$in.includes(record.outcomeType)) return false
  if (query.adminVerifiedAt?.$gte && record.adminVerifiedAt < query.adminVerifiedAt.$gte) return false
  if (query.adminVerifiedAt?.$lte && record.adminVerifiedAt > query.adminVerifiedAt.$lte) return false
  return true
})
const dependencies = {
  studentProfileModel: { find: profileFind },
  placementRecordModel: { find: recordFind },
  institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }),
}

test('M8 analytics uses the institution cohort denominator, unique placed students, and confirmed offers', async () => {
  const summary = await getAdminAnalyticsSummary({}, dependencies)
  assert.deepEqual(summary.cohort, {
    totalStudents: 5,
    eligibleStudents: 2,
    ineligibleStudents: 3,
    placedEligibleStudents: 2,
    unplacedEligibleStudents: 0,
    eligiblePlacementRate: 100,
    wholeBatchPlacementRate: 40,
    offersReceived: 3,
    confirmationPending: 0,
    confirmedOffers: 3,
  })
  assert.deepEqual(summary.packages, { lowest: 1000000, median: 1100000, average: 1100000, highest: 1200000 })
})

test('M8 analytics treats confirmed placement dates as the placement date and avoids fake package values', async () => {
  const summary = await getAdminAnalyticsSummary({ dateFrom: new Date('2027-10-01'), dateTo: new Date('2027-10-31') }, dependencies)
  assert.equal(summary.cohort.placedEligibleStudents, 0)
  assert.equal(summary.cohort.confirmedOffers, 0)
  assert.deepEqual(summary.packages, { highest: null, median: null, average: null, lowest: null })
})

test('college eligibility remains independent from Drive eligibility and honours configured academic rules', () => {
  assert.equal(isCollegePlacementEligible(profiles[0], { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] }), true)
  assert.equal(isCollegePlacementEligible(profiles[2], { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] }), false)
  assert.equal(isCollegePlacementEligible(profiles[4], { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] }), false)
  assert.deepEqual(packageStatistics([]), { highest: null, median: null, average: null, lowest: null })
})

test('M8B dashboard keeps branch, company, outcome, timeline, and dynamic Drive funnel analytics in one scoped query contract', async () => {
  const company = { _id: 'company-1', companyName: 'TCS', approvalStatus: 'approved' }
  const drive = { _id: 'drive-1', companyId: 'company-1', lifecycleStatus: 'published', role: { title: 'Engineer' }, phases: [{ phaseNumber: 1 }, { phaseNumber: 2 }] }
  const applications = [
    { _id: 'a1', studentId: 's1', placementDriveId: 'drive-1', currentPhase: 2, currentStatus: 'active', appliedAt: new Date('2027-09-01'), updatedAt: new Date('2027-09-02') },
    { _id: 'a2', studentId: 's2', placementDriveId: 'drive-1', currentPhase: 2, currentStatus: 'selected_pending_confirmation', appliedAt: new Date('2027-09-03') },
    { _id: 'a3', studentId: 's3', placementDriveId: 'drive-1', currentPhase: 1, currentStatus: 'rejected', appliedAt: new Date('2027-09-04') },
  ]
  const confirmed = [
    { studentId: 's1', companyId: 'company-1', placementDriveId: 'drive-1', verificationState: 'confirmed', outcomeType: 'full_time', adminVerifiedAt: new Date('2027-09-10'), package: { amount: 1200000, currency: 'INR', period: 'per_annum' } },
    { studentId: 's2', companyId: 'company-1', placementDriveId: 'drive-1', verificationState: 'confirmed', outcomeType: 'internship', adminVerifiedAt: new Date('2027-09-11'), package: { amount: 50000, currency: 'INR', period: 'per_month' } },
    { studentId: 's3', companyId: 'company-1', placementDriveId: 'drive-1', verificationState: 'revoked', outcomeType: 'ppo', adminVerifiedAt: new Date('2027-09-12'), package: { amount: 1400000, currency: 'INR', period: 'per_annum' } },
  ]
  const dashboard = await getAdminAnalyticsDashboard({ drive: 'drive-1' }, {
    studentProfileModel: { find: () => profiles }, companyModel: { find: () => [company] }, placementDriveModel: { find: () => [drive] }, applicationModel: { find: () => applications },
    placementRecordModel: { find: query => confirmed.filter(record => (!query.verificationState || record.verificationState === query.verificationState) && (!query.outcomeType?.$in || query.outcomeType.$in.includes(record.outcomeType))) },
    institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }),
  })
  assert.deepEqual(dashboard.funnel.phases, [{ phaseNumber: 0, count: 0 }, { phaseNumber: 1, count: 0 }, { phaseNumber: 2, count: 1 }])
  assert.equal(dashboard.companyPerformance[0].applicants, 3)
  assert.equal(dashboard.companyPerformance[0].confirmedPlacements, 2)
  assert.deepEqual(dashboard.outcomes, [{ outcomeType: 'full_time', count: 1 }, { outcomeType: 'ppo', count: 0 }, { outcomeType: 'internship', count: 1 }, { outcomeType: 'internship_and_ppo', count: 0 }])
  assert.equal(dashboard.branchPerformance.find(item => item.branch === 'CSE').placedStudents, 1)
  assert.equal(dashboard.timeline[0].confirmations, 2)
})

test('offer, confirmation, and unique-placement metrics do not double count multiple offers', async () => {
  const offerRecords = [
    { studentId: 's1', verificationState: 'confirmed', outcomeType: 'full_time' },
    { studentId: 's1', verificationState: 'confirmed', outcomeType: 'ppo' },
    { studentId: 's1', verificationState: 'pending_admin_verification', outcomeType: 'internship_and_ppo' },
    { studentId: 's2', verificationState: 'pending_admin_verification', outcomeType: 'full_time' },
    { studentId: 's3', verificationState: 'confirmed', outcomeType: 'internship' },
    { studentId: 's4', verificationState: 'revoked', outcomeType: 'full_time' },
  ]
  const result = await getAdminAnalyticsSummary({}, {
    studentProfileModel: { find: () => [{ userId: 's1', verificationStatus: 'verified', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }, { userId: 's2', verificationStatus: 'verified', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }, { userId: 's3', verificationStatus: 'verified', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }, { userId: 's4', verificationStatus: 'verified', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }] },
    placementRecordModel: { find: query => offerRecords.filter(record => record.verificationState === query.verificationState && (!query.outcomeType?.$in || query.outcomeType.$in.includes(record.outcomeType))) },
    institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }),
  })
  assert.deepEqual([result.cohort.offersReceived, result.cohort.confirmationPending, result.cohort.confirmedOffers, result.cohort.placedEligibleStudents], [5, 2, 3, 2])
})
