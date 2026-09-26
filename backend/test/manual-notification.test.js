import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-manual-notification-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { sendAdminCompanyNotification, sendAdminStudentNotification, sendCompanyAdminNotification, sendCompanyDriveApplicantsNotification } = await import('../src/modules/notifications/notification.service.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')

const ids = { admin: '507f1f77bcf86cd799439401', companyUser: '507f1f77bcf86cd799439402', otherCompanyUser: '507f1f77bcf86cd799439403', company: '507f1f77bcf86cd799439404', drive: '507f1f77bcf86cd799439405', studentOne: '507f1f77bcf86cd799439406', studentTwo: '507f1f77bcf86cd799439407' }
const drive = { _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published' }
const message = { title: 'Placement update', message: 'Please review the latest placement update.' }

function notificationModel(created) { return { create: async notifications => { created.push(...notifications); return notifications } } }
function profiles() { return { find: () => ({ select: () => ({ lean: async () => [{ userId: ids.studentOne }, { userId: ids.studentTwo }] }) }) } }

test('Admin sends a campus notification to all verified Students only', async () => {
  const created = []
  const result = await sendAdminStudentNotification(ids.admin, { ...message, audience: 'all_verified' }, { profileModel: profiles(), notificationModel: notificationModel(created) })
  assert.equal(result.notificationsCreated, 2)
  assert.equal(created[0].type, 'admin_to_students')
  assert.equal(created[0].placementDriveId, undefined)
  assert.ok(created[0].notificationBatchId)
  assert.equal(new Set(created.map(item => item.notificationBatchId)).size, 1)
})

test('Admin drive-specific messages validate published drives and target eligible Students or active applicants', async () => {
  const created = []
  let applicantQuery
  const options = {
    profileModel: profiles(),
    placementDriveModel: { findOne: async query => query._id === ids.drive && query.lifecycleStatus === 'published' ? drive : null },
    notificationModel: notificationModel(created),
    eligibilityService: async studentId => ({ eligible: studentId === ids.studentOne }),
    applicationModel: { find: query => { applicantQuery = query; return { select: () => ({ lean: async () => [{ studentId: ids.studentOne }, { studentId: ids.studentTwo }] }) } } },
  }
  await sendAdminStudentNotification(ids.admin, { ...message, audience: 'eligible_drive', placementDriveId: ids.drive }, options)
  assert.equal(created.length, 1)
  assert.equal(String(created[0].recipientId), ids.studentOne)
  assert.equal(String(created[0].placementDriveId), ids.drive)
  assert.equal(created[0].source, 'college')
  assert.deepEqual(created[0].context, { action: 'view_drive', audience: 'eligible_drive' })
  await new Notification(created[0]).validate()
  created.length = 0
  await sendAdminStudentNotification(ids.admin, { ...message, audience: 'drive_applicants', placementDriveId: ids.drive }, options)
  assert.equal(created.length, 2)
  assert.ok(created.every(item => item.notificationBatchId === created[0].notificationBatchId))
  assert.deepEqual(applicantQuery, { placementDriveId: ids.drive, currentStatus: { $ne: 'withdrawn' } })
  assert.ok(created.every(item => item.source === 'college' && String(item.placementDriveId) === ids.drive && item.context?.audience === 'drive_applicants'))
  await assert.rejects(sendAdminStudentNotification(ids.admin, { ...message, audience: 'eligible_drive', placementDriveId: '507f1f77bcf86cd799439499' }, options), { errorCode: 'NOT_FOUND' })
})

test('Admin can message only one approved Company, while Company messages go only to the Placement Admin and own drives', async () => {
  const created = []
  const companies = { findOne: async query => query.userId === ids.companyUser && query.approvalStatus === 'approved' ? { _id: ids.company, userId: ids.companyUser } : null }
  const adminMessage = await sendAdminCompanyNotification(ids.admin, ids.companyUser, { ...message, placementDriveId: ids.drive }, {
    companyModel: companies,
    placementDriveModel: { findOne: async query => query._id === ids.drive && query.companyId === ids.company ? drive : null },
    notificationModel: notificationModel(created),
  })
  assert.equal(adminMessage.notificationsCreated, 1)
  assert.equal(created[0].recipientId, ids.companyUser)
  assert.equal(created[0].source, 'college')
  assert.equal(String(created[0].placementDriveId), ids.drive)
  assert.deepEqual(created[0].context, { action: 'view_drive', audience: 'company' })
  assert.ok(created[0].notificationBatchId)
  created.length = 0
  await sendAdminCompanyNotification(ids.admin, ids.companyUser, message, { companyModel: companies, notificationModel: notificationModel(created) })
  assert.deepEqual(created[0].context, { action: 'view_company', audience: 'company' })
  await new Notification(created[0]).validate()
  await assert.rejects(sendAdminCompanyNotification(ids.admin, ids.otherCompanyUser, message, { companyModel: companies, notificationModel: notificationModel([]) }), { errorCode: 'NOT_FOUND' })
  await assert.rejects(sendAdminCompanyNotification(ids.admin, ids.companyUser, { ...message, placementDriveId: '507f1f77bcf86cd799439499' }, { companyModel: companies, placementDriveModel: { findOne: async () => null }, notificationModel: notificationModel([]) }), { errorCode: 'NOT_FOUND' })

  created.length = 0
  const companyMessage = await sendCompanyAdminNotification(ids.companyUser, { ...message, placementDriveId: ids.drive }, {
    companyModel: companies,
    placementDriveModel: { findOne: async query => query.companyId === ids.company && query._id === ids.drive ? drive : null },
    userModel: { findOne: async () => ({ _id: ids.admin }) },
    notificationModel: notificationModel(created),
  })
  assert.equal(companyMessage.notificationsCreated, 1)
  assert.equal(created[0].recipientId, ids.admin)
  assert.equal(String(created[0].placementDriveId), ids.drive)
  assert.ok(created[0].notificationBatchId)
  await assert.rejects(sendCompanyAdminNotification(ids.companyUser, { ...message, placementDriveId: '507f1f77bcf86cd799439499' }, {
    companyModel: companies,
    placementDriveModel: { findOne: async () => null },
    userModel: { findOne: async () => ({ _id: ids.admin }) },
    notificationModel: notificationModel([]),
  }), { errorCode: 'NOT_FOUND' })
})

test('Company can notify only active applicants of its own published Drive', async () => {
  const created = []
  const companies = { findOne: async query => query.userId === ids.companyUser && query.approvalStatus === 'approved' ? { _id: ids.company, userId: ids.companyUser } : null }
  const result = await sendCompanyDriveApplicantsNotification(ids.companyUser, { ...message, placementDriveId: ids.drive }, {
    companyModel: companies,
    placementDriveModel: { findOne: async query => query.companyId === ids.company && query.lifecycleStatus === 'published' ? drive : null },
    applicationModel: { find: () => ({ select: () => ({ lean: async () => [{ studentId: ids.studentOne }, { studentId: ids.studentOne }, { studentId: ids.studentTwo }] }) }) },
    notificationModel: notificationModel(created),
  })
  assert.equal(result.notificationsCreated, 2)
  assert.ok(created.every(item => item.type === 'company_to_drive_applicants' && item.source === 'company'))
  assert.ok(created.every(item => item.notificationBatchId === created[0].notificationBatchId))
  await assert.rejects(sendCompanyDriveApplicantsNotification(ids.companyUser, { ...message, placementDriveId: '507f1f77bcf86cd799439499' }, {
    companyModel: companies, placementDriveModel: { findOne: async () => null }, applicationModel: {}, notificationModel: notificationModel([]),
  }), { errorCode: 'NOT_FOUND' })
})

test('Company accounts cannot access Admin broadcast notification routes', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.companyUser, role: 'company', isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.companyUser, expiresIn: '1h' })}`, 'Content-Type': 'application/json' }
    const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/notifications/students`
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...message, audience: 'all_verified' }) })
    assert.equal(response.status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
