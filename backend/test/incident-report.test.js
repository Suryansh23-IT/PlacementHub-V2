import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-incident-report-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { applyRestrictionFromIncident, archiveIncidentReport, createCompanyIncidentReport, publicRestriction, reviewIncidentReport, removeAdminPlacementRestriction } = await import('../src/modules/incidents/incident-report.service.js')
const { consumePlacementRestrictionForDrive } = await import('../src/modules/applications/placement-restriction.service.js')
const { removePlacementRestriction } = await import('../src/modules/applications/placement-restriction.service.js')
const { evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const { incidentReportCreateSchema } = await import('../src/modules/incidents/incident-report.validation.js')

const ids = { admin: '507f1f77bcf86cd799439101', companyUser: '507f1f77bcf86cd799439102', company: '507f1f77bcf86cd799439103', otherCompany: '507f1f77bcf86cd799439104', student: '507f1f77bcf86cd799439105', application: '507f1f77bcf86cd799439106', drive: '507f1f77bcf86cd799439107', incident: '507f1f77bcf86cd799439108', restriction: '507f1f77bcf86cd799439109' }
const drive = { _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', driveDetails: { applicationDeadline: new Date('2027-02-01') }, eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }
const application = { _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, currentPhase: 0, currentStatus: 'withdrawn' }
const profile = { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }

function notificationModel(created) { return { create: async notifications => { created.push(...notifications); return notifications } } }

test('all Company incident categories validate and create a pending Admin review with Drive context', async () => {
  const categories = ['withdrawal', 'absent', 'cheating', 'misconduct', 'rule_violation', 'document_or_information_issue', 'other']
  for (const category of categories) {
    const input = incidentReportCreateSchema.parse({ applicationId: ids.application, category, description: `Report for ${category}.`, note: 'Optional context.' })
    const created = []
    const result = await createCompanyIncidentReport(ids.companyUser, input, {
      companyModel: { findOne: async () => ({ _id: ids.company, userId: ids.companyUser, companyName: 'Example Corp' }) },
      applicationModel: { findOne: async () => application },
      placementDriveModel: { findOne: async () => drive },
      incidentReportModel: { findOne: async () => null, create: async values => ({ _id: ids.incident, ...values, reviewStatus: 'pending_review', createdAt: new Date() }) },
      userModel: { findOne: async () => ({ _id: ids.admin }) },
      notificationModel: notificationModel(created),
    })
    assert.equal(result.category, category)
    assert.equal(result.applicationStatus, 'withdrawn')
    assert.equal(created.length, 1)
    assert.equal(created[0].placementDriveId, ids.drive)
    assert.equal(created[0].applicationId, ids.application)
    assert.equal(created[0].context.action, 'view_incident')
  }
})

test('Company reports only an applicant attached to its own drive and Admin receives notification', async () => {
  const created = []
  const result = await createCompanyIncidentReport(ids.companyUser, { applicationId: ids.application, category: 'withdrawal', description: 'Candidate withdrew after applying.' }, {
    companyModel: { findOne: async query => query.userId === ids.companyUser ? { _id: ids.company, userId: ids.companyUser, companyName: 'Example Corp' } : null },
    applicationModel: { findOne: async () => application },
    placementDriveModel: { findOne: async query => query.companyId === ids.company ? drive : null },
    incidentReportModel: { findOne: async () => null, create: async input => ({ _id: ids.incident, ...input, reviewStatus: 'pending_review', createdAt: new Date() }) },
    userModel: { findOne: async () => ({ _id: ids.admin }) }, notificationModel: notificationModel(created),
  })
  assert.equal(result.applicationId, ids.application)
  assert.equal(created.length, 1)
  assert.equal(created[0].recipientId, ids.admin)
  await assert.rejects(createCompanyIncidentReport(ids.companyUser, { applicationId: ids.application, category: 'withdrawal', description: 'x'.repeat(2) }, {
    companyModel: { findOne: async () => ({ _id: ids.company }) }, applicationModel: { findOne: async () => application }, placementDriveModel: { findOne: async () => null }, incidentReportModel: {}, userModel: {}, notificationModel: notificationModel([]),
  }), { errorCode: 'NOT_FOUND' })
})

test('Duplicate pending incident reports are blocked before they can notify Admin twice', async () => {
  const created = []
  await assert.rejects(createCompanyIncidentReport(ids.companyUser, { applicationId: ids.application, category: 'withdrawal', description: 'Candidate withdrew after applying.' }, {
    companyModel: { findOne: async () => ({ _id: ids.company, userId: ids.companyUser }) },
    applicationModel: { findOne: async () => application },
    placementDriveModel: { findOne: async () => drive },
    incidentReportModel: { findOne: async () => ({ _id: ids.incident }) },
    userModel: { findOne: async () => ({ _id: ids.admin }) }, notificationModel: notificationModel(created),
  }), { errorCode: 'CONFLICT' })
  assert.equal(created.length, 0)
})

test('A warning can later become a temporary restriction, then escalate to a permanent restriction without editing incident history', async () => {
  const incident = {
    _id: ids.incident,
    studentId: ids.student,
    companyId: ids.company,
    placementDriveId: ids.drive,
    applicationId: ids.application,
    reviewStatus: 'closed',
    decision: 'warning_only',
    reviewNote: 'Initial warning retained for history.',
  }
  const restrictions = []
  const restrictionModel = {
    findOne: async query => restrictions.find(item => item.studentId === query.studentId && item.status === query.status) ?? null,
    create: async values => {
      const restriction = { _id: `restriction-${restrictions.length + 1}`, ...values, async save() { return this } }
      restrictions.push(restriction)
      return restriction
    },
  }
  const notifications = []
  const dependencies = { incidentReportModel: { findOne: async () => incident }, placementRestrictionModel: restrictionModel, notificationModel: notificationModel(notifications), now: new Date('2027-01-15T10:00:00.000Z') }
  const temporary = await applyRestrictionFromIncident(ids.admin, ids.incident, { type: 'temporary_drive_count', driveCount: 3, reason: 'Repeated placement-rule concern.' }, dependencies)
  assert.equal(temporary.type, 'temporary_drive_count')
  assert.equal(temporary.remainingDriveCount, 3)
  assert.equal(incident.reviewStatus, 'closed')
  assert.equal(incident.decision, 'warning_only')
  const permanent = await applyRestrictionFromIncident(ids.admin, ids.incident, { type: 'permanent', reason: 'Escalated after further review.' }, dependencies)
  assert.equal(permanent.type, 'permanent')
  assert.equal(restrictions.length, 2)
  assert.equal(restrictions[0].status, 'inactive')
  assert.equal(restrictions[0].inactiveReason, 'superseded')
  assert.equal(restrictions[1].status, 'active')
  assert.deepEqual(notifications.map(item => item.type), ['temporary_restriction_imposed', 'permanent_restriction_imposed'])
})

test('Forget / Close Matter archives only a resolved incident and never changes its decision or an active restriction', async () => {
  const report = {
    _id: ids.incident,
    studentId: ids.student,
    companyId: ids.company,
    placementDriveId: ids.drive,
    applicationId: ids.application,
    reviewStatus: 'closed',
    decision: 'warning_only',
    reviewNote: 'Warning retained in history.',
    async save() { return this },
  }
  const archived = await archiveIncidentReport(ids.admin, ids.incident, {
    incidentReportModel: { findOne: async () => report },
    placementRestrictionModel: { findOne: async () => null },
    now: new Date('2027-01-16T10:00:00.000Z'),
  })
  assert.equal(archived.decision, 'warning_only')
  assert.equal(report.reviewStatus, 'closed')
  assert.equal(report.archivedBy, ids.admin)
  assert.equal(report.archivedAt.toISOString(), '2027-01-16T10:00:00.000Z')
  const activeRestriction = { _id: ids.restriction, status: 'active', type: 'temporary_drive_count', remainingDriveCount: 2 }
  const blockedReport = { ...report, archivedAt: undefined, archivedBy: undefined, async save() { return this } }
  await assert.rejects(
    () => archiveIncidentReport(ids.admin, ids.incident, { incidentReportModel: { findOne: async () => blockedReport }, placementRestrictionModel: { findOne: async () => activeRestriction } }),
    error => error?.errorCode === 'CONFLICT'
  )
  assert.equal(activeRestriction.status, 'active')
  assert.equal(blockedReport.archivedAt, undefined)
})

test('A Company cannot report an applicant from another Company\'s Placement Drive', async () => {
  const created = []
  await assert.rejects(createCompanyIncidentReport(ids.companyUser, { applicationId: ids.application, category: 'absent', description: 'Candidate was absent.' }, {
    companyModel: { findOne: async () => ({ _id: ids.otherCompany, userId: ids.companyUser, companyName: 'Other Corp' }) },
    applicationModel: { findOne: async () => application },
    placementDriveModel: { findOne: async query => query.companyId === ids.otherCompany ? null : drive },
    incidentReportModel: { findOne: async () => null },
    userModel: { findOne: async () => ({ _id: ids.admin }) },
    notificationModel: notificationModel(created),
  }), { errorCode: 'NOT_FOUND' })
  assert.equal(created.length, 0)
})

test('Admin no-action and warning decisions create no restriction, while temporary and permanent decisions notify the Student', async () => {
  const report = { _id: ids.incident, studentId: ids.student, companyId: ids.company, placementDriveId: ids.drive, applicationId: ids.application, reviewStatus: 'pending_review', async save() { return this } }
  const notifications = []
  const noAction = await reviewIncidentReport(ids.admin, ids.incident, { action: 'no_action', reviewNote: 'No institutional action is needed.' }, { incidentReportModel: { findOne: async () => report }, companyModel: { findOne: () => ({ select: async () => ({ userId: ids.companyUser }) }) }, notificationModel: notificationModel(notifications) })
  assert.equal(noAction.restriction, undefined)
  assert.equal(report.reviewStatus, 'closed')
  const warning = { ...report, reviewStatus: 'pending_review', save: async function () { return this } }
  await reviewIncidentReport(ids.admin, ids.incident, { action: 'warning_only', reviewNote: 'Please follow placement rules.' }, { incidentReportModel: { findOne: async () => warning }, companyModel: { findOne: () => ({ select: async () => ({ userId: ids.companyUser }) }) }, notificationModel: notificationModel(notifications) })
  assert.ok(notifications.some(item => item.type === 'placement_warning'))
  const permanent = { ...report, reviewStatus: 'pending_review', save: async function () { return this } }
  let imposed
  await reviewIncidentReport(ids.admin, ids.incident, { action: 'permanent_restriction', reviewNote: 'Restricted pending Admin removal.' }, { incidentReportModel: { findOne: async () => permanent }, companyModel: { findOne: () => ({ select: async () => ({ userId: ids.companyUser }) }) }, notificationModel: notificationModel(notifications), imposeRestrictionService: async (_student, input) => { imposed = { _id: ids.restriction, ...input }; return imposed } })
  assert.equal(imposed.type, 'permanent')
  assert.ok(notifications.some(item => item.type === 'permanent_restriction_imposed'))
  assert.ok(notifications.some(item => item.type === 'incident_report_resolved' && item.recipientId === ids.companyUser && item.source === 'college'))
})

test('Referral remains reviewable, then closes on a later Admin decision; closed reports cannot be processed twice', async () => {
  const report = { _id: ids.incident, studentId: ids.student, companyId: ids.company, placementDriveId: ids.drive, applicationId: ids.application, reviewStatus: 'pending_review', async save() { return this } }
  const dependencies = { incidentReportModel: { findOne: async () => report }, companyModel: { findOne: () => ({ select: async () => ({ userId: ids.companyUser }) }) }, notificationModel: notificationModel([]) }
  await reviewIncidentReport(ids.admin, ids.incident, { action: 'refer_to_department', reviewNote: 'Department review is required.' }, dependencies)
  assert.equal(report.reviewStatus, 'reviewed')
  assert.equal(report.decision, 'refer_to_department')
  await reviewIncidentReport(ids.admin, ids.incident, { action: 'warning_only', reviewNote: 'Department review completed; warning issued.' }, dependencies)
  assert.equal(report.reviewStatus, 'closed')
  await assert.rejects(reviewIncidentReport(ids.admin, ids.incident, { action: 'no_action', reviewNote: 'Second review.' }, dependencies), { errorCode: 'CONFLICT' })
})

test('Temporary restriction only notifies when its future-drive counter completes', async () => {
  const imposedAt = new Date('2027-01-10T10:00:00.000Z')
  const restriction = { studentId: ids.student, type: 'temporary_drive_count', status: 'active', imposedAt, remainingDriveCount: 2, consumedDriveIds: [], async save() { return this } }
  const model = { findOne: async query => query.status === 'active' && restriction.status === 'active' ? restriction : null }
  const notifications = []
  const notificationService = async values => { notifications.push(...values); return values }
  await consumePlacementRestrictionForDrive(ids.student, ids.drive, { placementRestrictionModel: model, placementDriveModel: { findOne: async () => ({ ...drive, lifecycleStatus: 'unpublished' }) } })
  assert.equal(restriction.remainingDriveCount, 2)
  assert.equal(restriction.consumedDriveIds.length, 0)
  await consumePlacementRestrictionForDrive(ids.student, ids.drive, { placementRestrictionModel: model, placementDriveModel: { findOne: async () => ({ ...drive, publishedAt: new Date('2027-01-09T10:00:00.000Z') }) } })
  assert.equal(restriction.remainingDriveCount, 2)
  const firstFutureDrive = '507f1f77bcf86cd799439121'
  await consumePlacementRestrictionForDrive(ids.student, firstFutureDrive, { placementRestrictionModel: model, notificationService, placementDriveModel: { findOne: async () => ({ ...drive, _id: firstFutureDrive, publishedAt: new Date('2027-01-11T10:00:00.000Z') }) } })
  assert.equal(restriction.remainingDriveCount, 1)
  assert.equal(notifications.length, 0)
  const finalFutureDrive = '507f1f77bcf86cd799439122'
  await consumePlacementRestrictionForDrive(ids.student, finalFutureDrive, { placementRestrictionModel: model, notificationService, placementDriveModel: { findOne: async () => ({ ...drive, _id: finalFutureDrive, publishedAt: new Date('2027-01-12T10:00:00.000Z') }) } })
  assert.equal(restriction.remainingDriveCount, 0)
  assert.equal(restriction.status, 'inactive')
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].type, 'temporary_restriction_completed')
  assert.equal(notifications[0].title, 'Placement restriction completed')
  await consumePlacementRestrictionForDrive(ids.student, finalFutureDrive, { placementRestrictionModel: model, notificationService, placementDriveModel: { findOne: async () => ({ ...drive, _id: finalFutureDrive, publishedAt: new Date('2027-01-12T10:00:00.000Z') }) } })
  assert.equal(notifications.length, 1)
  assert.equal(restriction.consumedDriveIds.length, 2)
  const restored = await evaluatePlacementDriveEligibility(ids.student, ids.drive, { profileModel: { findOne: async () => profile }, placementDriveModel: { findOne: async () => drive }, studentPolicyStatusService: async () => ({ acceptance: { _id: 'policy' } }), placementRestrictionService: async () => restriction.status === 'active' ? restriction : null, now: new Date('2027-01-01') })
  assert.equal(restored.eligible, true)
})

test('Permanent restriction blocks eligibility, and removing either type restores ordinary eligibility', async () => {
  const restricted = await evaluatePlacementDriveEligibility(ids.student, ids.drive, { profileModel: { findOne: async () => profile }, placementDriveModel: { findOne: async () => drive }, studentPolicyStatusService: async () => ({ acceptance: { _id: 'policy' } }), placementRestrictionService: async () => ({ type: 'permanent', status: 'active' }), now: new Date('2027-01-01') })
  assert.equal(restricted.eligible, false)
  assert.match(restricted.reasons[0].message, /Placement Administration/)
  const removal = { _id: ids.restriction, studentId: ids.student, status: 'active', type: 'permanent', async save() { return this } }
  const notifications = []
  const removed = await removeAdminPlacementRestriction(ids.admin, ids.restriction, 'Eligibility restored after review.', { placementRestrictionModel: { findOne: async () => removal }, notificationModel: notificationModel(notifications) })
  assert.equal(removed.status, 'inactive')
  assert.equal(removal.removalReason, 'Eligibility restored after review.')
  assert.equal(notifications[0].type, 'restriction_removed')
  const completionNotifications = []
  await consumePlacementRestrictionForDrive(ids.student, ids.drive, {
    placementRestrictionModel: { findOne: async query => query.status === 'active' && removal.status === 'active' ? removal : null },
    placementDriveModel: { findOne: async () => ({ ...drive, publishedAt: new Date('2027-02-01') }) },
    notificationService: async values => completionNotifications.push(...values),
  })
  assert.equal(completionNotifications.length, 0)
})

test('legacy withdrawal restrictions serialize as temporary counts, can be removed, and restore eligibility', async () => {
  const legacy = { _id: ids.restriction, studentId: ids.student, type: 'withdrawal_penalty', status: 'active', totalDriveCount: 5, remainingDriveCount: 5, reason: 'Legacy withdrawal restriction.', async save() { return this } }
  const serialized = publicRestriction(legacy)
  assert.equal(serialized.type, 'temporary_drive_count')
  assert.equal(serialized.initialDriveCount, 5)
  assert.equal(serialized.remainingDriveCount, 5)
  const notifications = []
  const placementRestrictionModel = {
    findOne: async query => query.status === 'active' && legacy.status === 'active' ? legacy : null,
  }
  await removeAdminPlacementRestriction(ids.admin, ids.restriction, 'Legacy restriction cleared.', { placementRestrictionModel, notificationModel: notificationModel(notifications) })
  assert.equal(legacy.status, 'inactive')
  const restored = await evaluatePlacementDriveEligibility(ids.student, ids.drive, { profileModel: { findOne: async () => profile }, placementDriveModel: { findOne: async () => drive }, studentPolicyStatusService: async () => ({ acceptance: { _id: 'policy' } }), placementRestrictionService: async () => legacy.status === 'active' ? legacy : null, now: new Date('2027-01-01') })
  assert.equal(restored.eligible, true)
  assert.equal(notifications[0].type, 'restriction_removed')
  await assert.rejects(
    () => removeAdminPlacementRestriction(ids.admin, ids.restriction, 'Already removed.', { placementRestrictionModel, notificationModel: notificationModel(notifications) }),
    error => error?.errorCode === 'NOT_FOUND'
  )
  assert.equal(notifications.length, 1)
})

test('legacy removal uses a scoped update without validating absent refactor fields, and rejects a second removal', async () => {
  const legacy = { _id: ids.restriction, studentId: ids.student, type: 'withdrawal_penalty', status: 'active', totalDriveCount: 5, remainingDriveCount: 5, reason: 'Legacy withdrawal restriction.' }
  let updates = 0
  const model = {
    findOne: async query => query.status === 'active' && legacy.status === 'active' ? legacy : null,
    updateOne: async (_query, update) => { updates += 1; Object.assign(legacy, update.$set); return { matchedCount: 1 } },
  }
  const removed = await removePlacementRestriction(ids.restriction, ids.admin, 'Legacy restriction cleared.', { placementRestrictionModel: model })
  assert.equal(removed.status, 'inactive')
  assert.equal(updates, 1)
  assert.equal(await removePlacementRestriction(ids.restriction, ids.admin, 'Second removal.', { placementRestrictionModel: model }), null)
})

test('current-format temporary restrictions retain their original count fields', () => {
  const current = publicRestriction({ _id: ids.restriction, studentId: ids.student, type: 'temporary_drive_count', initialDriveCount: 8, remainingDriveCount: 5, status: 'active', reason: 'Current restriction.' })
  assert.equal(current.type, 'temporary_drive_count')
  assert.equal(current.initialDriveCount, 8)
  assert.equal(current.remainingDriveCount, 5)
})

test('current-format temporary restrictions use their normal save path when removed', async () => {
  let saves = 0
  const restriction = {
    _id: 'current-temporary-1',
    type: 'temporary_drive_count',
    status: 'active',
    imposedBy: ids.admin,
    initialDriveCount: 3,
    remainingDriveCount: 3,
    async save() { saves += 1; return this },
  }
  const removed = await removePlacementRestriction(restriction._id, ids.admin, 'Administrative review completed.', {
    placementRestrictionModel: { findOne: async () => restriction },
  })
  assert.equal(saves, 1)
  assert.equal(removed.status, 'inactive')
  assert.equal(removed.removalReason, 'Administrative review completed.')
})

test('Discipline routes reject non-Admin users and invalid incident input before service access', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  let role = 'company'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.companyUser, role, isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.companyUser, expiresIn: '1h' })}`, 'Content-Type': 'application/json' }
    const base = `http://127.0.0.1:${server.address().port}/api/v1`
    const invalid = await fetch(`${base}/companies/me/incidents`, { method: 'POST', headers, body: JSON.stringify({ applicationId: ids.application, category: 'not_a_category', description: 'Invalid category.' }) })
    assert.equal(invalid.status, 422)
    const missingReason = await fetch(`${base}/companies/me/incidents`, { method: 'POST', headers, body: JSON.stringify({ applicationId: ids.application, category: 'withdrawal', description: '' }) })
    assert.equal(missingReason.status, 422)
    const adminOnly = await fetch(`${base}/admin/placement-discipline/incidents`, { headers })
    assert.equal(adminOnly.status, 403)
    const companyRemove = await fetch(`${base}/admin/placement-discipline/restrictions/${ids.restriction}/remove`, { method: 'PATCH', headers, body: JSON.stringify({ removalReason: 'No access.' }) })
    assert.equal(companyRemove.status, 403)
    const companyApplyRestriction = await fetch(`${base}/admin/placement-discipline/incidents/${ids.incident}/restriction`, { method: 'POST', headers, body: JSON.stringify({ type: 'permanent', reason: 'No access.' }) })
    assert.equal(companyApplyRestriction.status, 403)
    const companyArchiveMatter = await fetch(`${base}/admin/placement-discipline/incidents/${ids.incident}/archive`, { method: 'PATCH', headers })
    assert.equal(companyArchiveMatter.status, 403)
    role = 'student'
    const studentAdminOnly = await fetch(`${base}/admin/placement-discipline/restrictions`, { headers })
    assert.equal(studentAdminOnly.status, 403)
    const studentRemove = await fetch(`${base}/admin/placement-discipline/restrictions/${ids.restriction}/remove`, { method: 'PATCH', headers, body: JSON.stringify({ removalReason: 'No access.' }) })
    assert.equal(studentRemove.status, 403)
    role = 'placement_admin'
    const missingAdminReason = await fetch(`${base}/admin/placement-discipline/incidents/${ids.incident}/review`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'warning_only' }) })
    assert.equal(missingAdminReason.status, 422)
    const invalidRestriction = await fetch(`${base}/admin/placement-discipline/incidents/${ids.incident}/restriction`, { method: 'POST', headers, body: JSON.stringify({ type: 'other', reason: 'Invalid restriction type.' }) })
    assert.equal(invalidRestriction.status, 422)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
