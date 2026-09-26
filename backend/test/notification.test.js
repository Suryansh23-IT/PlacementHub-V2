import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { listSentNotifications, listStudentNotifications, markStudentNotificationRead } = await import('../src/modules/notifications/notification.service.js')

const ids = { student: '507f1f77bcf86cd799439301', otherStudent: '507f1f77bcf86cd799439302', notification: '507f1f77bcf86cd799439303' }

function notification({ recipientId = ids.student, isRead = false } = {}) {
  return { _id: ids.notification, recipientId, category: 'placement_drive', type: 'placement_drive_published', source: 'placement_system', title: 'New Placement Drive open', message: 'Software Engineer is now open for applications.', placementDriveId: '507f1f77bcf86cd799439304', companyId: '507f1f77bcf86cd799439305', context: { action: 'view_drive', audience: 'eligible_students' }, isRead, createdAt: new Date('2027-01-01'), async save() { return this } }
}

test('Student notification list returns only safe notification fields for that student', async () => {
  const own = notification()
  const list = await listStudentNotifications(ids.student, { notificationModel: { find: query => ({ sort: async () => query.recipientId === ids.student ? [own] : [] }) } })
  assert.equal(list.length, 1)
  assert.equal(list[0].title, 'New Placement Drive open')
  assert.equal(list[0].recipientId, undefined)
  assert.equal(list[0].companyId, '507f1f77bcf86cd799439305')
  assert.deepEqual(list[0].context, { action: 'view_drive', audience: 'eligible_students' })
})

test('Student can mark only their own notification as read', async () => {
  const own = notification()
  const result = await markStudentNotificationRead(ids.student, ids.notification, { notificationModel: { findOne: async query => query.recipientId === ids.student ? own : null }, now: new Date('2027-01-02') })
  assert.equal(result.isRead, true)
  assert.ok(result.readAt)
  await assert.rejects(markStudentNotificationRead(ids.otherStudent, ids.notification, { notificationModel: { findOne: async () => null } }), { errorCode: 'NOT_FOUND' })
})

test('Sent notification history groups broadcast deliveries and preserves read totals', async () => {
  const admin = '507f1f77bcf86cd799439399'
  const sent = { ...notification({ recipientId: ids.otherStudent }), senderId: admin, notificationBatchId: '9e2c8a4b-1adf-4f8d-b8ac-d0e8c5040a10', category: 'manual_placement_message', source: 'college', type: 'admin_to_students', isRead: true }
  const secondRecipient = { ...notification({ recipientId: ids.student }), _id: '507f1f77bcf86cd799439306', senderId: admin, notificationBatchId: sent.notificationBatchId, category: 'manual_placement_message', source: 'college', type: 'admin_to_students', isRead: false }
  let query
  const list = await listSentNotifications(admin, { notificationModel: { find: values => { query = values; return { sort: async () => [sent, secondRecipient] } } } })
  assert.deepEqual(query, { senderId: admin, category: 'manual_placement_message' })
  assert.equal(list.length, 1)
  assert.equal(list[0].type, 'admin_to_students')
  assert.equal(list[0].placementDriveId, sent.placementDriveId)
  assert.equal(list[0].recipientId, undefined)
  assert.equal(list[0].notificationBatchId, sent.notificationBatchId)
  assert.equal(list[0].recipientCount, 2)
  assert.equal(list[0].readCount, 1)
  assert.equal(list[0].unreadCount, 1)
})

test('Sent history keeps individual and legacy notifications compatible and isolates each sender', async () => {
  const admin = '507f1f77bcf86cd799439399'
  const company = '507f1f77bcf86cd799439398'
  const adminIndividual = { ...notification(), _id: '507f1f77bcf86cd799439307', senderId: admin, notificationBatchId: '9e2c8a4b-1adf-4f8d-b8ac-d0e8c5040a11', category: 'manual_placement_message', source: 'college', type: 'admin_to_company' }
  const companyIndividual = { ...notification(), _id: '507f1f77bcf86cd799439308', senderId: company, notificationBatchId: '9e2c8a4b-1adf-4f8d-b8ac-d0e8c5040a12', category: 'manual_placement_message', source: 'company', type: 'company_to_admin' }
  const legacy = { ...notification(), _id: '507f1f77bcf86cd799439309', senderId: admin, category: 'manual_placement_message', source: 'college', type: 'admin_to_students' }
  const records = [adminIndividual, companyIndividual, legacy]
  const notificationModel = { find: values => ({ sort: async () => records.filter(item => item.senderId === values.senderId && item.category === values.category) }) }

  const adminHistory = await listSentNotifications(admin, { notificationModel })
  const companyHistory = await listSentNotifications(company, { notificationModel })
  assert.equal(adminHistory.length, 2)
  assert.ok(adminHistory.every(item => item.type !== 'company_to_admin'))
  assert.equal(adminHistory.find(item => item.notificationBatchId === adminIndividual.notificationBatchId).recipientCount, 1)
  assert.equal(adminHistory.find(item => !item.notificationBatchId).recipientCount, 1)
  assert.equal(companyHistory.length, 1)
  assert.equal(companyHistory[0].type, 'company_to_admin')
})
