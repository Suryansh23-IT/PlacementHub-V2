import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-application-window-test-secret-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { ELIGIBILITY_REASON_CODES } = await import('../src/modules/applications/application.constants.js')
const { createPlacementDriveApplication, evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const { getStudentPlacementDriveDetail } = await import('../src/modules/applications/student-placement-drive.service.js')
const { closePlacementDriveApplications, extendPlacementDriveApplicationDeadline, reopenPlacementDriveApplications } = await import('../src/modules/placement-drives/placement-drive.service.js')

const now = new Date('2027-01-01T12:00:00.000Z')
const ids = { admin: '507f1f77bcf86cd799439001', student: '507f1f77bcf86cd799439002', drive: '507f1f77bcf86cd799439003' }

function drive({ deadline = new Date('2027-01-15T00:00:00.000Z'), closedAt, publishedAt = new Date('2027-01-01T10:00:00.000Z') } = {}) {
  return {
    _id: ids.drive, companyId: '507f1f77bcf86cd799439004', proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt,
    role: { title: 'Software Engineer' }, driveDetails: { applicationDeadline: deadline }, applicationsManuallyClosedAt: closedAt,
    eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] },
    async save() { return this },
  }
}

function dependencies(proposal = drive(), applications = []) {
  const notifications = []
  const profile = { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }
  return {
    placementDriveModel: { findOne: async () => proposal },
    profileModel: { findOne: async () => profile, find: () => ({ select: () => ({ lean: async () => [profile] }) }) },
    studentPolicyStatusService: async () => ({ acceptance: { studentId: ids.student } }),
    placementRestrictionService: async () => null,
    eligibilityService: async () => ({ eligible: true }),
    applicationModel: {
      findOne: async ({ studentId, placementDriveId }) => applications.find(item => item.studentId === studentId && item.placementDriveId === placementDriveId) ?? null,
      find: () => ({ select: () => ({ lean: async () => applications.filter(item => item.currentStatus !== 'withdrawn') }) }),
      create: async input => { const item = { _id: `application-${applications.length + 1}`, ...input }; applications.push(item); return item },
    },
    companyModel: { findOne: () => ({ select: async () => ({ companyName: 'Example Corp' }) }) },
    notificationModel: { create: async items => { notifications.push(...items); return items } },
    now, notifications, applications,
  }
}

const codes = result => result.reasons.map(reason => reason.code)

test('applications are accepted before the deadline and blocked after it passes', async () => {
  const open = dependencies()
  assert.equal((await createPlacementDriveApplication(ids.student, ids.drive, open)).eligible, true)
  const expired = dependencies(drive({ deadline: new Date('2026-12-31T00:00:00.000Z') }))
  const result = await evaluatePlacementDriveEligibility(ids.student, ids.drive, expired)
  assert.ok(codes(result).includes(ELIGIBILITY_REASON_CODES.APPLICATION_DEADLINE_PASSED))
  assert.match(result.reasons.find(reason => reason.code === ELIGIBILITY_REASON_CODES.APPLICATION_DEADLINE_PASSED).message, /deadline for this Placement Drive has passed/)
})

test('Admin extension restores application intake after expiry without changing publishedAt', async () => {
  const proposal = drive({ deadline: new Date('2026-12-31T00:00:00.000Z') })
  const options = dependencies(proposal)
  const result = await extendPlacementDriveApplicationDeadline(ids.drive, ids.admin, { applicationDeadline: '2027-01-20T00:00:00.000Z' }, options)
  assert.equal(result.drive.driveDetails.applicationDeadline.toISOString(), '2027-01-20T00:00:00.000Z')
  assert.equal(result.drive.publishedAt.getTime(), new Date('2027-01-01T10:00:00.000Z').getTime())
  assert.equal((await createPlacementDriveApplication(ids.student, ids.drive, options)).eligible, true)
  assert.equal(options.notifications[0].type, 'application_deadline_extended')
})

test('manual closure blocks new applications but retains existing applications and is idempotent', async () => {
  const applications = [{ _id: 'existing', studentId: 'another-student', placementDriveId: ids.drive, currentStatus: 'applied' }]
  const proposal = drive(); const options = dependencies(proposal, applications)
  const closed = await closePlacementDriveApplications(ids.drive, ids.admin, options)
  assert.equal(closed.alreadyClosed, false)
  assert.equal(applications.length, 1)
  const eligibility = await evaluatePlacementDriveEligibility(ids.student, ids.drive, options)
  assert.ok(codes(eligibility).includes(ELIGIBILITY_REASON_CODES.APPLICATIONS_MANUALLY_CLOSED))
  assert.equal(options.notifications[0].type, 'applications_manually_closed')
  const repeated = await closePlacementDriveApplications(ids.drive, ids.admin, options)
  assert.equal(repeated.alreadyClosed, true)
  assert.equal(options.notifications.length, 1)
})

test('reopening before a future deadline works, while reopening after expiry needs a future deadline', async () => {
  const proposal = drive({ closedAt: new Date('2027-01-01T11:00:00.000Z') }); const options = dependencies(proposal)
  const reopened = await reopenPlacementDriveApplications(ids.drive, ids.admin, {}, options)
  assert.equal(reopened.applicationWindow.open, true)
  assert.equal(proposal.applicationsManuallyClosedAt, undefined)
  assert.equal(options.notifications[0].type, 'applications_reopened')
  const expired = drive({ deadline: new Date('2026-12-31T00:00:00.000Z'), closedAt: new Date('2026-12-30T00:00:00.000Z') })
  await assert.rejects(reopenPlacementDriveApplications(ids.drive, ids.admin, {}, dependencies(expired)), { errorCode: 'VALIDATION_ERROR' })
  const reopenedExpired = await reopenPlacementDriveApplications(ids.drive, ids.admin, { applicationDeadline: '2027-01-21T00:00:00.000Z' }, dependencies(expired))
  assert.equal(reopenedExpired.applicationWindow.open, true)
})

test('an applied Phase 0 application remains visible after close, reopen, and close again', async () => {
  const proposal = drive()
  const options = dependencies(proposal)
  const applied = await createPlacementDriveApplication(ids.student, ids.drive, options)
  assert.equal(applied.application.currentPhase, 0)
  await closePlacementDriveApplications(ids.drive, ids.admin, options)
  await reopenPlacementDriveApplications(ids.drive, ids.admin, {}, options)
  await closePlacementDriveApplications(ids.drive, ids.admin, options)
  const detail = await getStudentPlacementDriveDetail(ids.student, ids.drive, options)
  assert.equal(detail.hasApplied, true)
  assert.equal(detail.application.currentStatus, 'applied')
  assert.equal(detail.application.currentPhase, 0)
  assert.equal(detail.applicationWindow.open, false)
  assert.ok(codes(detail.eligibilityResult).includes(ELIGIBILITY_REASON_CODES.APPLICATIONS_MANUALLY_CLOSED))
})

test('withdrawn applications cannot be reactivated and application-window blocks do not consume restrictions', async () => {
  const proposal = drive({ closedAt: new Date('2027-01-01T11:00:00.000Z') })
  const withdrawn = [{ _id: 'withdrawn', studentId: ids.student, placementDriveId: ids.drive, currentStatus: 'withdrawn' }]
  const options = dependencies(proposal, withdrawn)
  let restrictionConsumes = 0
  options.placementRestrictionService = async () => ({ type: 'temporary_drive_count', remainingDriveCount: 1 })
  options.consumePlacementRestrictionService = async () => { restrictionConsumes += 1 }
  await assert.rejects(createPlacementDriveApplication(ids.student, ids.drive, options), { errorCode: 'CONFLICT' })
  assert.equal(restrictionConsumes, 0)
  const blocked = await createPlacementDriveApplication('new-student', ids.drive, options)
  assert.equal(blocked.application, null)
  assert.ok(codes(blocked).includes(ELIGIBILITY_REASON_CODES.APPLICATIONS_MANUALLY_CLOSED))
  assert.equal(restrictionConsumes, 0)
  await reopenPlacementDriveApplications(ids.drive, ids.admin, {}, options)
  await assert.rejects(createPlacementDriveApplication(ids.student, ids.drive, options), { errorCode: 'CONFLICT' })
  assert.equal(restrictionConsumes, 0)
})

test('application-window notifications are targeted and do not duplicate after idempotent operations', async () => {
  const proposal = drive(); const options = dependencies(proposal, [{ studentId: ids.student, placementDriveId: ids.drive, currentStatus: 'applied' }])
  await extendPlacementDriveApplicationDeadline(ids.drive, ids.admin, { applicationDeadline: '2027-01-20T00:00:00.000Z' }, options)
  await closePlacementDriveApplications(ids.drive, ids.admin, options)
  await reopenPlacementDriveApplications(ids.drive, ids.admin, {}, options)
  await reopenPlacementDriveApplications(ids.drive, ids.admin, {}, options)
  assert.deepEqual(options.notifications.map(item => item.type), ['application_deadline_extended', 'applications_manually_closed', 'applications_reopened'])
  assert.ok(options.notifications.every(item => item.placementDriveId === ids.drive && item.context.action === 'view_drive'))
})

test('Company and Student accounts cannot mutate the Admin application-window routes', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  let role = 'company'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.student, role, isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.student, expiresIn: '1h' })}`, 'Content-Type': 'application/json' }
    const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/placement-drives/${ids.drive}/application-window/close`
    assert.equal((await fetch(url, { method: 'PATCH', headers })).status, 403)
    role = 'student'
    assert.equal((await fetch(url, { method: 'PATCH', headers })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
