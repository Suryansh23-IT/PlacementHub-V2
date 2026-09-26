import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { Application } = await import('../src/modules/applications/application.model.js')
const { ELIGIBILITY_REASON_CODES } = await import('../src/modules/applications/application.constants.js')
const { createPlacementDriveApplication, evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')

const now = new Date('2027-01-01T12:00:00.000Z')
const ids = { student: '507f1f77bcf86cd799439011', drive: '507f1f77bcf86cd799439012' }
const student = { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8.2, activeBacklogs: 0, graduationYear: 2027 }
const drive = {
  _id: ids.drive,
  proposalStatus: 'approved',
  lifecycleStatus: 'published',
  driveDetails: { applicationDeadline: new Date('2027-01-15T00:00:00.000Z') },
  eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7.5, maximumActiveBacklogs: 0, graduationYears: [2027] },
}

function dependencies({ profile = student, proposal = drive, accepted = true, applications = [] } = {}) {
  return {
    profileModel: { findOne: async () => profile },
    placementDriveModel: { findOne: async () => proposal },
    studentPolicyStatusService: async () => ({ acceptance: accepted ? { studentId: ids.student, policyId: 'policy-1' } : null }),
    placementRestrictionService: async () => null,
    applicationModel: {
      findOne: async ({ studentId, placementDriveId }) => applications.find(application => application.studentId === studentId && application.placementDriveId === placementDriveId) ?? null,
      create: async input => { const application = { _id: `application-${applications.length + 1}`, ...input }; applications.push(application); return application },
    },
    now,
  }
}

const codes = result => result.reasons.map(reason => reason.code)

test('eligible verified Student with an accepted policy passes drive-specific eligibility', async () => {
  const result = await evaluatePlacementDriveEligibility(ids.student, ids.drive, dependencies())
  assert.equal(result.eligible, true)
  assert.deepEqual(result.reasons, [])
})

test('eligibility returns deterministic reasons for academic and profile failures', async () => {
  const scenarios = [
    [{ ...student, cgpa: 7.4 }, ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET],
    [{ ...student, branch: 'Mechanical Engineering' }, ELIGIBILITY_REASON_CODES.BRANCH_NOT_ELIGIBLE],
    [{ ...student, activeBacklogs: 1 }, ELIGIBILITY_REASON_CODES.TOO_MANY_ACTIVE_BACKLOGS],
    [{ ...student, graduationYear: 2028 }, ELIGIBILITY_REASON_CODES.GRADUATION_YEAR_NOT_ELIGIBLE],
    [{ ...student, verificationStatus: 'pending' }, ELIGIBILITY_REASON_CODES.STUDENT_NOT_VERIFIED],
  ]
  for (const [profile, code] of scenarios) {
    const result = await evaluatePlacementDriveEligibility(ids.student, ids.drive, dependencies({ profile }))
    assert.equal(result.eligible, false)
    assert.ok(codes(result).includes(code))
  }
})

test('eligibility rejects a missing Student policy, closed drive, and expired deadline', async () => {
  const noPolicy = await evaluatePlacementDriveEligibility(ids.student, ids.drive, dependencies({ accepted: false }))
  assert.ok(codes(noPolicy).includes(ELIGIBILITY_REASON_CODES.STUDENT_POLICY_NOT_ACCEPTED))
  const closed = await evaluatePlacementDriveEligibility(ids.student, ids.drive, dependencies({ proposal: { ...drive, lifecycleStatus: 'unpublished' } }))
  assert.ok(codes(closed).includes(ELIGIBILITY_REASON_CODES.DRIVE_NOT_OPEN))
  const expired = await evaluatePlacementDriveEligibility(ids.student, ids.drive, dependencies({ proposal: { ...drive, driveDetails: { applicationDeadline: new Date('2026-12-31T23:59:00.000Z') } } }))
  assert.ok(codes(expired).includes(ELIGIBILITY_REASON_CODES.APPLICATION_DEADLINE_PASSED))
})

test('Eligibility is recalculated from the current Student profile on every evaluation', async () => {
  const currentProfile = { ...student }
  const options = dependencies({ profile: currentProfile })
  assert.equal((await evaluatePlacementDriveEligibility(ids.student, ids.drive, options)).eligible, true)
  currentProfile.cgpa = 6.5
  const afterAcademicChange = await evaluatePlacementDriveEligibility(ids.student, ids.drive, options)
  assert.equal(afterAcademicChange.eligible, false)
  assert.ok(codes(afterAcademicChange).includes(ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET))
  currentProfile.cgpa = 8.2
  currentProfile.verificationStatus = 'pending'
  const afterVerificationChange = await evaluatePlacementDriveEligibility(ids.student, ids.drive, options)
  assert.ok(codes(afterVerificationChange).includes(ELIGIBILITY_REASON_CODES.STUDENT_NOT_VERIFIED))
})

test('Application creation rechecks eligibility, prevents duplicates, and creates the Phase 0 history entry', async () => {
  const options = dependencies()
  const created = await createPlacementDriveApplication(ids.student, ids.drive, options)
  assert.equal(created.eligible, true)
  assert.equal(created.application.currentPhase, 0)
  assert.equal(created.application.currentStatus, 'applied')
  assert.equal(created.application.phaseHistory.length, 1)
  assert.deepEqual(created.application.phaseHistory[0], { phase: 0, status: 'applied', event: 'applied', occurredAt: now })
  await assert.rejects(createPlacementDriveApplication(ids.student, ids.drive, options), { errorCode: 'CONFLICT' })
  const ineligible = await createPlacementDriveApplication(ids.student, ids.drive, dependencies({ profile: { ...student, cgpa: 4 } }))
  assert.equal(ineligible.application, null)
  assert.ok(codes(ineligible).includes(ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET))
})

test('Application schema has unique Student-drive and M7 monitoring indexes', () => {
  const indexes = Application.schema.indexes()
  assert.ok(indexes.some(([keys, options]) => keys.studentId === 1 && keys.placementDriveId === 1 && options.unique))
  assert.ok(indexes.some(([keys]) => keys.placementDriveId === 1 && keys.currentPhase === 1 && keys.currentStatus === 1))
})

test('Application model defaults begin with the system-owned Phase 0 applied history', async () => {
  const application = new Application({ studentId: ids.student, placementDriveId: ids.drive })
  await application.validate()
  assert.equal(application.currentPhase, 0)
  assert.equal(application.currentStatus, 'applied')
  assert.equal(application.phaseHistory[0].phase, 0)
  assert.equal(application.phaseHistory[0].event, 'applied')
})
