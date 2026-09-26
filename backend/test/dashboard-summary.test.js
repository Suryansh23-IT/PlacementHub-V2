import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { getAdminDashboardSummary, getCompanyDashboardSummary, getStudentDashboardSummary } = await import('../src/modules/dashboard/dashboard.service.js')
const ids = { student: '507f1f77bcf86cd799439701', companyUser: '507f1f77bcf86cd799439702', company: '507f1f77bcf86cd799439703', admin: '507f1f77bcf86cd799439704', drive: '507f1f77bcf86cd799439705' }

test('Student dashboard summary is scoped to the logged-in Student and uses current eligibility', async () => {
  const summary = await getStudentDashboardSummary(ids.student, {
    placementDriveModel: { find: () => ({ select: async () => [{ _id: ids.drive }, { _id: 'drive-two' }] }) },
    eligibilityService: async (_studentId, driveId) => ({ eligible: driveId === ids.drive }),
    applicationModel: { countDocuments: async query => { assert.equal(query.studentId, ids.student); return 2 } },
    notificationModel: { countDocuments: async query => { assert.deepEqual(query, { recipientId: ids.student, isRead: false }); return 3 } },
  })
  assert.deepEqual(summary, { publishedDriveCount: 2, eligibleDriveCount: 1, activeApplicationCount: 2, unreadNotificationCount: 3 })
})

test('Company dashboard counts only owned drives, active Phase 0 applicants, and own unread notifications', async () => {
  const summary = await getCompanyDashboardSummary(ids.companyUser, {
    companyModel: { findOne: async query => query.userId === ids.companyUser ? { _id: ids.company } : null },
    placementDriveModel: { find: () => ({ select: async () => [{ _id: ids.drive, proposalStatus: 'draft', lifecycleStatus: 'unpublished' }, { _id: 'published-drive', proposalStatus: 'approved', lifecycleStatus: 'published' }] }) },
    applicationModel: { countDocuments: async query => { assert.deepEqual(query.placementDriveId.$in, ['published-drive']); assert.equal(query.currentPhase, 0); return 4 } },
    notificationModel: { countDocuments: async query => { assert.equal(query.recipientId, ids.companyUser); return 1 } },
  })
  assert.equal(summary.driveCounts.total, 2)
  assert.equal(summary.driveCounts.draft, 1)
  assert.equal(summary.driveCounts.approved, 1)
  assert.equal(summary.driveCounts.published, 1)
  assert.equal(summary.activeApplicantCount, 4)
  assert.equal(summary.unreadNotificationCount, 1)
})

test('Admin dashboard returns pending workflow and unread counts from existing collections', async () => {
  const queries = []
  const model = count => ({ countDocuments: async query => { queries.push(query); return count } })
  const summary = await getAdminDashboardSummary(ids.admin, { studentProfileModel: model(2), companyModel: model(3), placementDriveModel: { countDocuments: async query => { queries.push(query); return query.lifecycleStatus === 'published' ? 5 : 4 } }, incidentReportModel: model(6), notificationModel: model(7) })
  assert.deepEqual(summary, { pendingStudentVerificationCount: 2, pendingCompanyApprovalCount: 3, pendingDriveReviewCount: 4, publishedDriveCount: 5, pendingIncidentReviewCount: 6, unreadNotificationCount: 7 })
  assert.ok(queries.some(query => query.recipientId === ids.admin && query.isRead === false))
})
