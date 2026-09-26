import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-student-drive-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { ELIGIBILITY_REASON_CODES } = await import('../src/modules/applications/application.constants.js')
const { applyToStudentPlacementDrive, getStudentPlacementDriveDetail, getStudentPlacementDriveDocument, getStudentVisiblePlacementDrive, listMyPlacementApplications, listStudentPlacementDrives } = await import('../src/modules/applications/student-placement-drive.service.js')

const now = new Date('2027-01-01T12:00:00.000Z')
const ids = { student: '507f1f77bcf86cd799439011', otherStudent: '507f1f77bcf86cd799439012', drive: '507f1f77bcf86cd799439013', hidden: '507f1f77bcf86cd799439014', company: '507f1f77bcf86cd799439015' }

function placementDrive({ _id = ids.drive, lifecycleStatus = 'published', applicationsManuallyClosedAt } = {}) {
  return {
    _id,
    companyId: ids.company,
    proposalStatus: 'approved',
    lifecycleStatus,
    role: { title: 'Software Engineer', domain: 'Engineering', employmentType: 'full_time', description: 'Build reliable systems.' },
    driveDetails: { applicationDeadline: new Date('2027-01-15T00:00:00.000Z'), workLocation: 'Raipur', workMode: 'hybrid', expectedHires: 5 },
    eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] },
    applicationsManuallyClosedAt,
    phases: [{ phaseNumber: 1, title: 'Assessment', type: 'assessment' }],
    documents: { companyRecruitmentInformation: { originalName: 'company.pdf', storagePath: '/private/company.pdf', mimeType: 'application/pdf', size: 10 }, placementDriveJobDescription: { originalName: 'jd.pdf', storagePath: '/private/jd.pdf', mimeType: 'application/pdf', size: 10 } },
  }
}

function dependencies({ profile, applications = [], drives = [placementDrive(), placementDrive({ _id: ids.hidden, lifecycleStatus: 'unpublished' })] } = {}) {
  const students = [
    profile ?? { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 },
    { userId: ids.otherStudent, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 },
  ]
  const matches = (drive, query) => Object.entries(query).every(([key, value]) => String(drive[key]) === String(value))
  const placementDriveModel = {
    find: query => ({ sort: async () => drives.filter(drive => matches(drive, query)) }),
    findOne: async query => drives.find(drive => matches(drive, query)) ?? null,
  }
  const applicationModel = {
    findOne: async query => applications.find(application => application.studentId === query.studentId && application.placementDriveId === query.placementDriveId) ?? null,
    find: query => ({ sort: async () => applications.filter(application => application.studentId === query.studentId) }),
    create: async input => { const application = { _id: `application-${applications.length + 1}`, ...input }; applications.push(application); return application },
  }
  return {
    placementDriveModel,
    applicationModel,
    profileModel: { findOne: async ({ userId }) => students.find(student => student.userId === userId) ?? null },
    companyModel: { findOne: () => ({ select: async () => ({ companyName: 'Acme Technologies', industry: 'Software', location: 'Raipur', officialEmail: 'careers@acme.example', recruiterName: 'Asha Rao', recruiterEmail: 'asha@acme.example' }) }) },
    studentPolicyStatusService: async studentId => ({ acceptance: studentId === ids.student ? { studentId, policyId: 'policy-1' } : null }),
    placementRestrictionService: async () => null,
    now,
    applications,
  }
}

const reasonCodes = result => result.eligibilityResult.reasons.map(reason => reason.code)

test('Student list returns only published Drives with per-Student eligibility and company summary', async () => {
  const list = await listStudentPlacementDrives(ids.student, dependencies())
  assert.equal(list.length, 1)
  assert.equal(list[0]._id, ids.drive)
  assert.equal(list[0].company.companyName, 'Acme Technologies')
  assert.equal(list[0].eligibilityResult.eligible, true)
})

test('Student list and detail include deterministic ineligibility reasons without exposing PDF storage paths', async () => {
  const options = dependencies({ profile: { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 6, activeBacklogs: 0, graduationYear: 2027 } })
  const [item] = await listStudentPlacementDrives(ids.student, options)
  assert.ok(reasonCodes(item).includes(ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET))
  const detail = await getStudentPlacementDriveDetail(ids.student, ids.drive, options)
  assert.ok(reasonCodes(detail).includes(ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET))
  assert.equal(detail.documents.companyRecruitmentInformation.storagePath, undefined)
  assert.match(detail.documents.companyRecruitmentInformation.downloadUrl, /companyRecruitmentInformation\/download$/)
  assert.equal(detail.phases[0].phaseNumber, 1)
})

test('a retained Phase 0 application remains present in the Placement Center response when intake closes', async () => {
  const applications = [{ _id: 'application-closed', studentId: ids.student, placementDriveId: ids.drive, currentPhase: 0, currentStatus: 'applied', appliedAt: now }]
  const closedDrive = placementDrive({ applicationsManuallyClosedAt: new Date('2027-01-02T10:00:00.000Z') })
  const [item] = await listStudentPlacementDrives(ids.student, dependencies({ applications, drives: [closedDrive] }))
  assert.equal(item.hasApplied, true)
  assert.equal(item.application.currentStatus, 'applied')
  assert.equal(item.application.currentPhase, 0)
  assert.equal(item.applicationWindow.open, false)
  assert.ok(reasonCodes(item).includes(ELIGIBILITY_REASON_CODES.APPLICATIONS_MANUALLY_CLOSED))
})

test('eligible Student applies into Phase 0, while ineligible and duplicate applications are blocked', async () => {
  const options = dependencies()
  const applied = await applyToStudentPlacementDrive(ids.student, ids.drive, options)
  assert.equal(applied.eligible, true)
  assert.equal(applied.application.currentPhase, 0)
  assert.equal(applied.application.phaseHistory[0].event, 'applied')
  await assert.rejects(applyToStudentPlacementDrive(ids.student, ids.drive, options), { errorCode: 'CONFLICT' })

  const blockedOptions = dependencies({ profile: { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 5, activeBacklogs: 0, graduationYear: 2027 } })
  const blocked = await applyToStudentPlacementDrive(ids.student, ids.drive, blockedOptions)
  assert.equal(blocked.application, null)
  assert.ok(blocked.reasons.some(reason => reason.code === ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET))
  assert.equal(blockedOptions.applications.length, 0)
})

test('Student cannot access unpublished Drives or their documents', async () => {
  const options = dependencies()
  await assert.rejects(getStudentVisiblePlacementDrive(ids.hidden, options), { errorCode: 'NOT_FOUND' })
  await assert.rejects(getStudentPlacementDriveDocument(ids.student, ids.hidden, 'companyRecruitmentInformation', options), { errorCode: 'NOT_FOUND' })
  const document = await getStudentPlacementDriveDocument(ids.student, ids.drive, 'companyRecruitmentInformation', options)
  assert.equal(document.storagePath, '/private/company.pdf')
  await assert.rejects(applyToStudentPlacementDrive(ids.student, ids.hidden, options), { errorCode: 'NOT_FOUND' })
  assert.equal(options.applications.length, 0)
})

test('My Applications returns only the logged-in Student application with Phase 0 history and Drive summary', async () => {
  const applications = [
    { _id: 'application-1', studentId: ids.student, placementDriveId: ids.drive, appliedAt: now, currentPhase: 0, currentStatus: 'applied', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: now }] },
    { _id: 'application-2', studentId: ids.otherStudent, placementDriveId: ids.drive, appliedAt: now, currentPhase: 0, currentStatus: 'applied', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: now }] },
  ]
  const list = await listMyPlacementApplications(ids.student, dependencies({ applications }))
  assert.equal(list.length, 1)
  assert.equal(list[0]._id, 'application-1')
  assert.equal(list[0].currentPhase, 0)
  assert.equal(list[0].drive.company.companyName, 'Acme Technologies')
})

test('Company accounts cannot access Student Placement Drive APIs', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.student, role: 'company', isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.student, expiresIn: '1h' })}` }
    const url = `http://127.0.0.1:${server.address().port}/api/v1/students/me/placement-drives`
    assert.equal((await fetch(url, { headers })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
