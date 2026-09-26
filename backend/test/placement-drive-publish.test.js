import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-publish-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { publishPlacementDriveProposal } = await import('../src/modules/placement-drives/placement-drive.service.js')

const now = new Date('2027-01-01T12:00:00.000Z')
const ids = { admin: '507f1f77bcf86cd799439001', drive: '507f1f77bcf86cd799439002', eligible: '507f1f77bcf86cd799439003', ineligible: '507f1f77bcf86cd799439004' }

function drive({ proposalStatus = 'approved', lifecycleStatus = 'unpublished' } = {}) {
  return {
    _id: ids.drive,
    proposalStatus,
    lifecycleStatus,
    role: { title: 'Software Engineer' },
    driveDetails: { applicationDeadline: new Date('2027-01-15T00:00:00.000Z') },
    eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] },
    async save() { return this },
  }
}

function dependencies(proposal, { accepted = true } = {}) {
  const profiles = [
    { userId: ids.eligible, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 },
    { userId: ids.ineligible, verificationStatus: 'verified', branch: 'Mechanical Engineering', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 },
  ]
  const notifications = []
  const profileModel = {
    find: () => ({ select: () => ({ lean: async () => profiles.filter(profile => profile.verificationStatus === 'verified') }) }),
    findOne: async ({ userId }) => profiles.find(profile => profile.userId === userId) ?? null,
  }
  return {
    placementDriveModel: { findOne: async () => proposal },
    profileModel,
    notificationModel: { create: async items => { notifications.push(...items); return items } },
    studentPolicyStatusService: async studentId => ({ acceptance: accepted && studentId === ids.eligible ? { studentId, policyId: 'policy-1' } : null }),
    placementRestrictionService: async () => null,
    now,
    notifications,
  }
}

test('Admin publish changes an approved unpublished Drive to open/published and notifies eligible Students only', async () => {
  const proposal = drive()
  const options = dependencies(proposal)
  let applicationCreateCalls = 0
  options.applicationModel = { create: async () => { applicationCreateCalls += 1 } }
  const result = await publishPlacementDriveProposal(ids.drive, ids.admin, options)
  assert.equal(result.drive.lifecycleStatus, 'published')
  assert.equal(result.drive.publishedAt.getTime(), now.getTime())
  assert.equal(result.notificationsCreated, 1)
  assert.deepEqual(options.notifications[0], {
    recipientId: ids.eligible,
    senderId: ids.admin,
    category: 'placement_drive',
    type: 'placement_drive_published',
    source: 'placement_system',
    title: 'New Placement Drive open',
    message: 'Software Engineer is now open for applications.',
    placementDriveId: ids.drive,
    context: { action: 'view_drive', audience: 'eligible_students' },
  })
  const eligibility = await evaluatePlacementDriveEligibility(ids.eligible, ids.drive, options)
  assert.equal(eligibility.eligible, true)
  assert.equal(applicationCreateCalls, 0)
})

test('only an approved unpublished Drive can be published and repeated publish is idempotent', async () => {
  await assert.rejects(publishPlacementDriveProposal(ids.drive, ids.admin, dependencies(drive({ proposalStatus: 'submitted' }))), { errorCode: 'CONFLICT' })
  const proposal = drive()
  const options = dependencies(proposal)
  await publishPlacementDriveProposal(ids.drive, ids.admin, options)
  const repeated = await publishPlacementDriveProposal(ids.drive, ids.admin, options)
  assert.equal(repeated.alreadyPublished, true)
  assert.equal(repeated.notificationsCreated, 0)
  assert.equal(options.notifications.length, 1)
})

test('notification schema supports generic drive and future application delivery fields', () => {
  const indexes = Notification.schema.indexes()
  assert.ok(indexes.some(([keys]) => keys.recipientId === 1 && keys.isRead === 1 && keys.createdAt === -1))
  assert.equal(Notification.schema.path('isRead').options.default, false)
  assert.equal(Notification.schema.path('placementDriveId').options.ref, 'PlacementDrive')
  assert.equal(Notification.schema.path('applicationId').options.ref, 'Application')
})

test('Company and Student accounts cannot access the Admin publish route', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  let role = 'company'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.eligible, role, isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.eligible, expiresIn: '1h' })}` }
    const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/placement-drives/${ids.drive}/publish`
    assert.equal((await fetch(url, { method: 'PATCH', headers })).status, 403)
    role = 'student'
    assert.equal((await fetch(url, { method: 'PATCH', headers })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
