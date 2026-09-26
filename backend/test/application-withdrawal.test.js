import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-withdrawal-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { ELIGIBILITY_REASON_CODES } = await import('../src/modules/applications/application.constants.js')
const { createPlacementDriveApplication, evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const { withdrawStudentApplication } = await import('../src/modules/applications/application-withdrawal.service.js')
const { PlacementRestriction } = await import('../src/modules/applications/placement-restriction.model.js')

const now = new Date('2027-01-10T10:00:00.000Z')
const ids = { student: '507f1f77bcf86cd799439201', drive: '507f1f77bcf86cd799439202', application: '507f1f77bcf86cd799439203' }
const student = { userId: ids.student, verificationStatus: 'verified', branch: 'Information Technology', cgpa: 8, activeBacklogs: 0, graduationYear: 2027 }
const drive = { _id: ids.drive, proposalStatus: 'approved', lifecycleStatus: 'published', driveDetails: { applicationDeadline: new Date('2027-01-20T00:00:00.000Z') }, eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }

function eligibilityDependencies({ restriction = null, applications = [] } = {}) {
  return {
    profileModel: { findOne: async () => student },
    placementDriveModel: { findOne: async () => drive },
    studentPolicyStatusService: async () => ({ acceptance: { studentId: ids.student, policyId: 'policy-1' } }),
    placementRestrictionService: async () => restriction,
    applicationModel: {
      findOne: async ({ studentId, placementDriveId }) => applications.find(item => item.studentId === studentId && item.placementDriveId === placementDriveId) ?? null,
      create: async input => { const application = { _id: 'created-application', ...input }; applications.push(application); return application },
    },
    now,
  }
}

test('Withdrawing keeps the Application history without imposing an automatic restriction', async () => {
  const application = { _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, currentPhase: 0, currentStatus: 'applied', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date('2027-01-01') }], async save() { return this } }
  const result = await withdrawStudentApplication(ids.student, ids.application, {
    applicationModel: { findOne: async query => query._id === ids.application && query.studentId === ids.student ? application : null },
    now,
  })
  assert.equal(result.application.currentStatus, 'withdrawn')
  assert.equal(result.application.withdrawnAt.getTime(), now.getTime())
  assert.deepEqual(result.application.phaseHistory.at(-1), { phase: 0, status: 'withdrawn', event: 'withdrawn', occurredAt: now, actorId: ids.student })
  assert.equal(result.restriction, undefined)
  await assert.rejects(withdrawStudentApplication(ids.student, ids.application, { applicationModel: { findOne: async () => application } }), { errorCode: 'CONFLICT' })
})

test('Active placement restriction produces a deterministic reason and consumes only an attempted eligible drive', async () => {
  const restriction = { remainingDriveCount: 3 }
  const options = eligibilityDependencies({ restriction })
  const evaluation = await evaluatePlacementDriveEligibility(ids.student, ids.drive, options)
  assert.equal(evaluation.eligible, false)
  assert.ok(evaluation.reasons.some(reason => reason.code === ELIGIBILITY_REASON_CODES.PLACEMENT_RESTRICTED))
  let consumed = 0
  const result = await createPlacementDriveApplication(ids.student, ids.drive, { ...options, consumePlacementRestrictionService: async () => { consumed += 1 } })
  assert.equal(result.application, null)
  assert.equal(consumed, 1)
})

test('A retained withdrawn Application still blocks duplicate application creation', async () => {
  const applications = [{ _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, currentStatus: 'withdrawn' }]
  let consumed = 0
  await assert.rejects(createPlacementDriveApplication(ids.student, ids.drive, { ...eligibilityDependencies({ applications }), consumePlacementRestrictionService: async () => { consumed += 1 } }), { errorCode: 'CONFLICT' })
  assert.equal(consumed, 0)
})

test('A Student cannot withdraw another Student’s application', async () => {
  const otherStudent = '507f1f77bcf86cd799439204'
  await assert.rejects(withdrawStudentApplication(otherStudent, ids.application, {
    applicationModel: { findOne: async query => query.studentId === ids.student ? { _id: ids.application } : null },
  }), { errorCode: 'NOT_FOUND' })
})

test('Placement restriction model supports Admin-imposed temporary and permanent restrictions', () => {
  assert.equal(PlacementRestriction.schema.path('remainingDriveCount').options.min, 0)
  assert.equal(PlacementRestriction.schema.path('sourceIncidentReportId').options.ref, 'IncidentReport')
  assert.equal(PlacementRestriction.schema.path('removedBy').options.ref, 'User')
  assert.ok(PlacementRestriction.schema.indexes().some(([keys]) => keys.studentId === 1 && keys.status === 1))
})
