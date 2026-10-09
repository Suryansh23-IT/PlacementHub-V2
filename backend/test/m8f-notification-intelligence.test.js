import { notificationScope } from '../src/modules/notifications/notification-domain.js'
import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const {
  listNotificationPage,
  listSentNotificationPage,
  markAllNotificationsRead,
  previewAdminExplorerNotification,
  previewCompanyCandidatesNotification,
  sendCompanyCandidatesNotification,
} = await import('../src/modules/notifications/notification.service.js')

const ids = { admin: '507f1f77bcf86cd799439401', companyUser: '507f1f77bcf86cd799439402', otherCompany: '507f1f77bcf86cd799439403', company: '507f1f77bcf86cd799439404', drive: '507f1f77bcf86cd799439405', otherDrive: '507f1f77bcf86cd799439406', s1: '507f1f77bcf86cd799439407', s2: '507f1f77bcf86cd799439408', s3: '507f1f77bcf86cd799439409', s4: '507f1f77bcf86cd799439410', a1: '507f1f77bcf86cd799439411', a2: '507f1f77bcf86cd799439412', a3: '507f1f77bcf86cd799439413' }
const lean = values => ({ lean: async () => values })
const sorted = values => ({ sort: async () => values })
const now = new Date('2026-10-06T10:00:00.000Z')

function notification(overrides = {}) {
  return { _id: `n-${Math.random()}`, recipientId: ids.s1, senderId: ids.admin, category: 'manual_placement_message', type: 'admin_to_students', source: 'college', title: 'Placement update', message: 'Please review.', isRead: false, createdAt: now, context: { action: 'view_application', audience: 'student' }, ...overrides }
}

function explorerDependencies() {
  const users = [{ _id: ids.s1, name: 'Asha', email: 'asha@college.test' }, { _id: ids.s2, name: 'Bharat', email: 'bharat@college.test' }, { _id: ids.s3, name: 'Cia', email: 'cia@college.test' }, { _id: ids.s4, name: 'Dev', email: 'dev@college.test' }]
  const profiles = [{ userId: ids.s1, rollNumber: 'IT001', branch: 'IT', graduationYear: 2027, cgpa: 9, activeBacklogs: 0, verificationStatus: 'verified' }, { userId: ids.s2, rollNumber: 'CS002', branch: 'CSE', graduationYear: 2027, cgpa: 8, activeBacklogs: 0, verificationStatus: 'verified' }, { userId: ids.s3, rollNumber: 'IT003', branch: 'IT', graduationYear: 2027, cgpa: 7, activeBacklogs: 1, verificationStatus: 'pending' }, { userId: ids.s4, rollNumber: 'IT004', branch: 'IT', graduationYear: 2027, cgpa: 8.5, activeBacklogs: 0, verificationStatus: 'verified' }]
  const records = [{ studentId: ids.s1, companyId: ids.company, outcomeType: 'full_time', verificationState: 'confirmed' }]
  const applications = [{ studentId: ids.s1, placementDriveId: ids.drive, currentPhase: 3, currentStatus: 'placement_confirmed', updatedAt: now }, { studentId: ids.s2, placementDriveId: ids.drive, currentPhase: 2, currentStatus: 'active', updatedAt: now }, { studentId: ids.s4, placementDriveId: ids.drive, currentPhase: 1, currentStatus: 'selected_pending_confirmation', updatedAt: now }]
  return { userModel: { find: () => ({ select: () => lean(users) }) }, profileModel: { find: () => lean(profiles) }, recordModel: { find: () => lean(records) }, applicationModel: { find: () => lean(applications) }, driveModel: { find: () => ({ select: () => lean([{ _id: ids.drive, driveCode: 'DRV-1', role: { title: 'Engineer' } }]) }) }, companyModel: { find: () => ({ select: () => lean([{ _id: ids.company, companyName: 'Acme' }]) }) }, institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }) }
}

test('M8F student inbox applies ownership, state/category/search, paging and read updates without leaking recipient metadata', async () => {
  const own = [notification({ _id: 'n1', category: 'phase_update', placementDriveId: ids.drive, title: 'Drive opened', createdAt: new Date('2026-10-05T10:00:00Z') }), notification({ _id: 'n2', category: 'placement_confirmed', isRead: true, title: 'Placement confirmed', createdAt: new Date('2026-10-06T10:00:00Z') }), notification({ _id: 'n3', category: 'system_profile', title: 'Profile reminder', createdAt: new Date('2026-10-04T10:00:00Z') })]
  const model = { find: query => sorted((query.recipientId === ids.s1 ? own : []).filter(item => query.isRead == null || item.isRead === query.isRead)), updateMany: async query => { assert.deepEqual(query, { recipientId: ids.s1, isRead: false, ...notificationScope('placement') }); return { modifiedCount: 2 } } }
  const unread = await listNotificationPage(ids.s1, { state: 'unread', category: 'all', page: 1, limit: 25 }, { notificationModel: model })
  const recruitment = await listNotificationPage(ids.s1, { state: 'all', category: 'recruitment', search: 'DRIVE', page: 1, limit: 1 }, { notificationModel: model })
  const placement = await listNotificationPage(ids.s1, { state: 'read', category: 'placement', page: 1, limit: 25 }, { notificationModel: model })
  const system = await listNotificationPage(ids.s1, { state: 'all', category: 'system', page: 1, limit: 25 }, { notificationModel: model })
  assert.equal(unread.unreadCount, 2); assert.deepEqual(unread.records.map(item => item._id), ['n1', 'n3']); assert.equal(recruitment.totalRecords, 1); assert.equal(recruitment.records[0].recipientId, undefined); assert.equal(placement.records[0]._id, 'n2'); assert.equal(system.records[0]._id, 'n3')
  assert.deepEqual(await markAllNotificationsRead(ids.s1, { notificationModel: model, now }), { updated: 2 })
})

test('M8F Admin target presets use the Explorer cohort resolver with exact server-side counts and stale selected IDs fail', async () => {
  const deps = explorerDependencies()
  const cases = [
    [{}, 4], [{ collegeEligibility: 'eligible' }, 3], [{ collegeEligibility: 'eligible', placementStatus: 'unplaced_eligible' }, 2], [{ placementStatus: 'placed' }, 1], [{ branch: 'IT' }, 3], [{ drive: ids.drive }, 3], [{ phase: 2 }, 1], [{ applicationStatus: 'selected_pending_confirmation' }, 1], [{ outcomeType: 'full_time' }, 1],
  ]
  for (const [filters, count] of cases) assert.equal((await previewAdminExplorerNotification({ mode: 'all_matching', filters }, deps)).recipientCount, count)
  assert.equal((await previewAdminExplorerNotification({ mode: 'selected', selectedStudentIds: [ids.s1, ids.s2], filters: {} }, deps)).recipientCount, 2)
  await assert.rejects(previewAdminExplorerNotification({ mode: 'selected', selectedStudentIds: [ids.s1, 'missing'], filters: {} }, deps), error => error.errorCode === 'VALIDATION_ERROR')
})

test('M8F Company candidate targets are exact, ownership-scoped, idempotent and provide only safe preview fields', async () => {
  const apps = [{ _id: ids.a1, studentId: ids.s1, placementDriveId: ids.drive, currentPhase: 2, currentStatus: 'active' }, { _id: ids.a2, studentId: ids.s2, placementDriveId: ids.drive, currentPhase: 2, currentStatus: 'selected_pending_confirmation' }, { _id: ids.a3, studentId: ids.s3, placementDriveId: ids.drive, currentPhase: 3, currentStatus: 'withdrawn' }]
  const created = []; const notificationModel = { find: query => ({ select: () => lean(query.idempotencyKey ? created.filter(item => item.senderId === query.senderId && item.idempotencyKey === query.idempotencyKey) : []) }), create: async rows => { created.push(...rows); return rows } }
  const dependencies = {
    companyModel: { findOne: async query => query.userId === ids.companyUser ? { _id: ids.company, companyName: 'Acme' } : null },
    placementDriveModel: { findOne: async query => query._id === ids.drive && query.companyId === ids.company ? { _id: ids.drive, companyId: ids.company, role: { title: 'Engineer' }, phases: [{ phaseNumber: 2, title: 'Assessment' }] } : null },
    applicationModel: { find: query => ({ select: () => lean(apps.filter(app => String(app.placementDriveId) === String(query.placementDriveId) && (!query._id || query._id.$in.includes(app._id)) && (!query.currentStatus || (query.currentStatus.$in ? query.currentStatus.$in.includes(app.currentStatus) : app.currentStatus === query.currentStatus)) && (!query.currentPhase || app.currentPhase === query.currentPhase))) }) },
    userModel: { find: () => ({ select: () => lean([{ _id: ids.s1, name: 'Asha' }, { _id: ids.s2, name: 'Bharat' }, { _id: ids.s3, name: 'Cia' }]) }) },
    profileModel: { find: () => ({ select: () => lean([{ userId: ids.s1, rollNumber: 'IT001', branch: 'IT' }, { userId: ids.s2, rollNumber: 'CS002', branch: 'CSE' }, { userId: ids.s3, rollNumber: 'IT003', branch: 'IT' }]) }) }, notificationModel,
  }
  for (const [target, extra, count] of [['all_applicants', {}, 3], ['active', {}, 1], ['phase', { phaseNumber: 2 }, 1], ['selected', {}, 1], ['specific', { selectedApplicationIds: [ids.a1] }, 1]]) assert.equal((await previewCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, target, requestId: '123e4567-e89b-12d3-a456-426614174000', ...extra }, dependencies)).recipientCount, count)
  const preview = await previewCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, target: 'specific', selectedApplicationIds: [ids.a1], requestId: '123e4567-e89b-12d3-a456-426614174000' }, dependencies)
  assert.deepEqual(Object.keys(preview.recipients[0]).sort(), ['applicationId', 'branch', 'currentPhase', 'name', 'rollNumber'])
  const sendInput = { placementDriveId: ids.drive, target: 'specific', selectedApplicationIds: [ids.a1], title: 'Update', message: 'Review.', requestId: '123e4567-e89b-12d3-a456-426614174000' }
  const sent = await sendCompanyCandidatesNotification(ids.companyUser, sendInput, dependencies)
  const retry = await sendCompanyCandidatesNotification(ids.companyUser, sendInput, dependencies)
  const newBatch = await sendCompanyCandidatesNotification(ids.companyUser, { ...sendInput, requestId: '123e4567-e89b-12d3-a456-426614174001' }, dependencies)
  assert.equal(sent.recipientCount, 1); assert.equal(retry.alreadySent, true); assert.equal(newBatch.alreadySent, false); assert.equal(created.length, 2)
  assert.equal((await previewCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, target: 'phase', phaseNumber: 4, requestId: '123e4567-e89b-12d3-a456-426614174002' }, dependencies)).recipientCount, 0)
  await assert.rejects(sendCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, target: 'phase', phaseNumber: 4, title: 'Update', message: 'Review.', requestId: '123e4567-e89b-12d3-a456-426614174002' }, dependencies), error => error.errorCode === 'VALIDATION_ERROR')
  await assert.rejects(previewCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.otherDrive, target: 'all_applicants', requestId: '123e4567-e89b-12d3-a456-426614174000' }, dependencies), error => error.errorCode === 'NOT_FOUND')
  await assert.rejects(previewCompanyCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, target: 'specific', selectedApplicationIds: ['507f1f77bcf86cd799439499'], requestId: '123e4567-e89b-12d3-a456-426614174000' }, dependencies), error => error.errorCode === 'VALIDATION_ERROR')
})

test('M8F sent history is sender-isolated, newest first, paginated, searchable and inclusive at both date boundaries', async () => {
  const records = [notification({ _id: 'old', senderId: ids.admin, notificationBatchId: 'old-batch', title: 'Old', createdAt: new Date('2026-09-30T18:30:00.000Z'), placementDriveId: ids.drive, phaseNumber: 2, context: { audience: 'phase_candidates' } }), notification({ _id: 'new', senderId: ids.admin, notificationBatchId: 'new-batch', title: 'Newest', createdAt: new Date('2026-10-01T18:29:59.999Z'), placementDriveId: ids.drive, phaseNumber: 2, context: { audience: 'phase_candidates' } }), notification({ _id: 'other', senderId: ids.otherCompany, notificationBatchId: 'other-batch', title: 'Foreign', createdAt: now })]
  const model = { find: query => sorted(records.filter(item => item.senderId === query.senderId && item.category === query.category)) }
  const page = await listSentNotificationPage(ids.admin, { search: 'new', category: 'manual_placement_message', drive: ids.drive, phase: 2, targetType: 'phase_candidates', dateFrom: new Date('2026-10-01'), dateTo: new Date('2026-10-01'), page: 1, limit: 1 }, { notificationModel: model })
  assert.equal(page.totalRecords, 1); assert.equal(page.records[0].title, 'Newest'); assert.equal(page.records[0].senderId, undefined); assert.equal(page.records[0].recipientId, undefined)
  const all = await listSentNotificationPage(ids.admin, { page: 1, limit: 25 }, { notificationModel: model }); assert.deepEqual(all.records.map(item => item.title), ['Newest', 'Old'])
})

test('M8F role boundaries deny Student access to Admin and Company notification operations', async t => {
  const { app } = await import('../src/app.js'); const { User } = await import('../src/modules/auth/auth.model.js'); const { default: jwt } = await import('jsonwebtoken'); const { env } = await import('../src/config/env.js')
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.s1, role: 'student', isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.s1, expiresIn: '1h' })}`, 'Content-Type': 'application/json' }; const root = `http://127.0.0.1:${server.address().port}/api/v1`
    assert.equal((await fetch(`${root}/admin/notifications/sent/page`, { headers })).status, 403)
    assert.equal((await fetch(`${root}/companies/me/notifications/candidates/preview`, { method: 'POST', headers, body: JSON.stringify({}) })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
