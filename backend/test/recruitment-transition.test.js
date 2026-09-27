import assert from 'node:assert/strict'
import test from 'node:test'

const { executeCompanyRecruitmentTransition } = await import('../src/modules/recruitment/recruitment-transition.service.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')

const ids = { companyUser: '507f1f77bcf86cd799439101', otherCompanyUser: '507f1f77bcf86cd799439102', company: '507f1f77bcf86cd799439103', drive: '507f1f77bcf86cd799439104', application: '507f1f77bcf86cd799439105', student: '507f1f77bcf86cd799439106' }
const now = new Date('2031-03-15T09:00:00.000Z')

function drive(phaseCount = 2, overrides = {}) {
  return {
    _id: ids.drive,
    companyId: ids.company,
    proposalStatus: 'approved',
    lifecycleStatus: 'published',
    phases: Array.from({ length: phaseCount }, (_, index) => ({ phaseNumber: index + 1, title: `Phase ${index + 1}`, type: 'other' })),
    ...overrides,
  }
}

function application(overrides = {}) {
  return {
    _id: ids.application,
    studentId: ids.student,
    placementDriveId: ids.drive,
    currentPhase: 0,
    currentStatus: 'applied',
    phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date('2031-03-01T09:00:00.000Z') }],
    async save() { return this },
    ...overrides,
  }
}

function dependencies({ company = { _id: ids.company }, placementDrive = drive(), candidate = application() } = {}) {
  return {
    companyModel: { findOne: async query => query.userId === ids.companyUser ? company : null },
    placementDriveModel: { findOne: async query => query._id === ids.drive && query.companyId === ids.company ? placementDrive : null },
    applicationModel: { findOne: async query => query._id === ids.application && query.placementDriveId === ids.drive ? candidate : null },
    now,
  }
}

const transition = (candidate, input, options = {}) => executeCompanyRecruitmentTransition(ids.companyUser, ids.drive, ids.application, input, dependencies({ candidate, ...options }))
const assertCode = (promise, code) => assert.rejects(promise, error => error?.errorCode === code)

test('Phase 0 advances only to Phase 1 and preserves audit history', async () => {
  const candidate = application()
  const updated = await transition(candidate, { action: 'advance', targetPhase: 1 })
  assert.deepEqual([updated.currentPhase, updated.currentStatus], [1, 'active'])
  assert.equal(updated.phaseHistory.length, 2)
  assert.deepEqual(updated.phaseHistory.at(-1), { phase: 1, status: 'active', event: 'advanced', occurredAt: now, actorId: ids.companyUser })
})

test('invalid phase targets and repeated transitions are blocked', async () => {
  const candidate = application()
  await assertCode(transition(candidate, { action: 'advance', targetPhase: 2 }), 'CONFLICT')
  await assertCode(transition(candidate, { action: 'advance', targetPhase: 6 }), 'VALIDATION_ERROR')
  await transition(candidate, { action: 'advance', targetPhase: 1 })
  await assertCode(transition(candidate, { action: 'advance', targetPhase: 1 }), 'CONFLICT')
  assert.equal(candidate.phaseHistory.length, 2)
})

test('reject and restore preserve the candidate phase and append both events', async () => {
  const candidate = application({ currentPhase: 2, currentStatus: 'active' })
  await transition(candidate, { action: 'reject', reason: 'Did not meet the technical benchmark.' })
  assert.equal(candidate.currentStatus, 'rejected')
  await transition(candidate, { action: 'restore_rejected', reason: 'Score sheet correction approved.' })
  assert.deepEqual([candidate.currentPhase, candidate.currentStatus], [2, 'active'])
  assert.deepEqual(candidate.phaseHistory.slice(-2).map(entry => entry.event), ['rejected', 'restored_rejected'])
})

test('absence can be restored only to the same phase', async () => {
  const candidate = application({ currentPhase: 1, currentStatus: 'active' })
  await transition(candidate, { action: 'mark_absent', reason: 'Candidate was not present at check-in.' })
  await transition(candidate, { action: 'restore_absent', reason: 'Attendance evidence corrected.' })
  assert.deepEqual([candidate.currentPhase, candidate.currentStatus], [1, 'active'])
  assert.equal(candidate.phaseHistory.at(-1).phase, 1)
  await assertCode(transition(candidate, { action: 'restore_absent' }), 'CONFLICT')
})

test('backward corrections require a reason and preserve the exact target phase', async () => {
  const candidate = application({ currentPhase: 3, currentStatus: 'active' })
  const options = { placementDrive: drive(3) }
  await assertCode(transition(candidate, { action: 'move_backward', targetPhase: 1 }, options), 'VALIDATION_ERROR')
  await transition(candidate, { action: 'move_backward', targetPhase: 1, reason: 'Reattempt approved after an interview issue.' }, options)
  assert.deepEqual([candidate.currentPhase, candidate.currentStatus, candidate.phaseHistory.at(-1).event], [1, 'active', 'moved_backward'])
})

test('withdrawn and placement-confirmed candidates cannot advance', async () => {
  for (const currentStatus of ['withdrawn', 'placement_confirmed']) {
    const candidate = application({ currentPhase: 1, currentStatus })
    await assertCode(transition(candidate, { action: 'advance', targetPhase: 2 }), 'CONFLICT')
    assert.equal(candidate.phaseHistory.length, 1)
  }
})

test('only a final-stage candidate can be provisionally selected, then unselected with a reason', async () => {
  const candidate = application({ currentPhase: 2, currentStatus: 'active' })
  await transition(candidate, { action: 'provisionally_select' })
  assert.equal(candidate.currentStatus, 'selected_pending_confirmation')
  await assertCode(transition(candidate, { action: 'unselect' }), 'VALIDATION_ERROR')
  await transition(candidate, { action: 'unselect', reason: 'Offer details require correction.' })
  assert.deepEqual([candidate.currentPhase, candidate.currentStatus], [2, 'active'])
  const nonFinal = application({ currentPhase: 1, currentStatus: 'active' })
  await assertCode(transition(nonFinal, { action: 'provisionally_select' }), 'CONFLICT')
})

test('a candidate placed elsewhere is closed with a reason and cannot re-enter recruitment', async () => {
  const candidate = application({ currentPhase: 1, currentStatus: 'active' })
  await transition(candidate, { action: 'close_placed_elsewhere', reason: 'Student accepted another verified placement opportunity.' })
  assert.equal(candidate.currentStatus, 'closed_placed_elsewhere')
  await assertCode(transition(candidate, { action: 'advance', targetPhase: 2 }), 'CONFLICT')
  assert.equal(candidate.phaseHistory.at(-1).event, 'closed_placed_elsewhere')
})

test('one-phase and five-phase blueprints use phase numbers without hard-coded rounds', async () => {
  const onePhase = application()
  await transition(onePhase, { action: 'advance', targetPhase: 1 }, { placementDrive: drive(1) })
  await transition(onePhase, { action: 'provisionally_select' }, { placementDrive: drive(1) })
  assert.equal(onePhase.currentStatus, 'selected_pending_confirmation')
  const fivePhase = application()
  for (let phase = 1; phase <= 5; phase += 1) await transition(fivePhase, { action: 'advance', targetPhase: phase }, { placementDrive: drive(5) })
  assert.deepEqual([fivePhase.currentPhase, fivePhase.currentStatus, fivePhase.phaseHistory.length], [5, 'active', 6])
})

test('Company ownership and drive lifecycle prevent cross-company or inactive-drive transitions', async () => {
  const candidate = application()
  await assertCode(executeCompanyRecruitmentTransition(ids.otherCompanyUser, ids.drive, ids.application, { action: 'advance', targetPhase: 1 }, dependencies({ candidate })), 'FORBIDDEN')
  await assertCode(transition(candidate, { action: 'advance', targetPhase: 1 }, { placementDrive: drive(2, { lifecycleStatus: 'postponed' }) }), 'CONFLICT')
  assert.equal(candidate.phaseHistory.length, 1)
})

test('runtime phase execution and PlacementRecord foundations preserve required independent data', async () => {
  const executionDrive = new PlacementDrive({
    companyId: ids.company,
    role: { title: 'Engineer', employmentType: 'full_time', description: 'Role description' },
    driveDetails: { workMode: 'online', workLocation: 'Remote', expectedHires: 1, applicationDeadline: new Date('2031-02-01') },
    eligibility: { minimumCgpa: 7, allowedBranches: ['IT'], maximumActiveBacklogs: 0, graduationYears: [2031] },
    phases: [{ phaseNumber: 1, title: 'Assessment', type: 'assessment' }],
    phaseExecution: [{ phaseNumber: 1, status: 'scheduled', mode: 'online', resources: [{ type: 'test_link', url: 'https://example.test/assessment' }] }],
  })
  await executionDrive.validate()
  assert.equal(executionDrive.phases[0].title, 'Assessment')
  assert.equal(executionDrive.phaseExecution[0].phaseNumber, 1)
  await assert.rejects(new PlacementDrive({ ...executionDrive.toObject(), phaseExecution: [{ phaseNumber: 1 }, { phaseNumber: 1 }] }).validate())
  await assert.rejects(new PlacementDrive({ ...executionDrive.toObject(), phaseExecution: [{ phaseNumber: 2 }] }).validate())
  const record = new PlacementRecord({ studentId: ids.student, applicationId: ids.application, placementDriveId: ids.drive, companyId: ids.company, outcomeType: 'full_time', role: 'Engineer', history: [{ event: 'company_provisional_selection', occurredAt: now }] })
  await record.validate()
  assert.equal(record.verificationState, 'company_provisional')
  assert.ok(PlacementRecord.schema.indexes().some(([keys, options]) => keys.applicationId === 1 && options.unique))
})
