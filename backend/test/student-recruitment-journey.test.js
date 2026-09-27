import assert from 'node:assert/strict'
import test from 'node:test'
import { getStudentCurrentPhaseExecution, getStudentRecruitmentJourney } from '../src/modules/applications/student-placement-drive.service.js'
import { withdrawStudentApplication } from '../src/modules/applications/application-withdrawal.service.js'

const ids = { student: '507f1f77bcf86cd799439101', other: '507f1f77bcf86cd799439102', application: '507f1f77bcf86cd799439103', drive: '507f1f77bcf86cd799439104', company: '507f1f77bcf86cd799439105' }
const baseDrive = (count = 3) => ({ _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Software Engineer' }, driveDetails: { workLocation: 'Bengaluru', workMode: 'hybrid' }, phases: Array.from({ length: count }, (_, index) => ({ phaseNumber: index + 1, title: `Stage ${index + 1}`, type: 'assessment', description: `Student-visible phase ${index + 1}.` })), phaseExecution: [{ phaseNumber: 2, scheduledAt: new Date('2032-01-02T09:00:00.000Z'), mode: 'online', instructions: 'Join using the provided link.', resources: [{ type: 'meeting_link', label: 'Teams', url: 'https://teams.example.test/meeting' }], instructionPdf: { originalName: 'stage-2.pdf', storagePath: '/private/stage-2.pdf', mimeType: 'application/pdf', size: 128, uploadedAt: new Date() } }, { phaseNumber: 3, instructions: 'Future-private instructions.', resources: [{ type: 'test_link', label: 'Future test', url: 'https://future.example.test' }] }] })
const app = overrides => ({ _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, appliedAt: new Date('2032-01-01T09:00:00.000Z'), currentPhase: 2, currentStatus: 'active', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date('2032-01-01T09:00:00.000Z') }, { phase: 1, status: 'active', event: 'advanced', occurredAt: new Date('2032-01-01T10:00:00.000Z'), note: 'Private Company note' }, { phase: 2, status: 'active', event: 'advanced', occurredAt: new Date('2032-01-02T08:00:00.000Z') }], ...overrides })
function deps(application = app(), drive = baseDrive()) { return { applicationModel: { findOne: async query => query.studentId === ids.student && query._id === ids.application ? application : null }, placementDriveModel: { findOne: async () => drive }, companyModel: { findOne: () => ({ select: async () => ({ companyName: 'Microsoft', industry: 'Technology', location: 'Bengaluru' }) }) } } }

test('journey returns only safe Student data and current phase execution', async () => {
  const result = await getStudentRecruitmentJourney(ids.student, ids.application, deps())
  assert.deepEqual([result.drive.company.companyName, result.currentPhase.phaseNumber, result.currentPhaseExecution.resources.length], ['Microsoft', 2, 1])
  assert.equal(JSON.stringify(result).includes('Future-private instructions.'), false)
  assert.equal(JSON.stringify(result).includes('Private Company note'), false)
  assert.equal(JSON.stringify(result).includes('/private/stage-2.pdf'), false)
  assert.match(result.currentPhaseExecution.instructionPdf.downloadUrl, /current-phase\/instruction-pdf\/download$/)
})

test('phase-zero, one-phase, and five-phase journeys remain dynamic', async () => {
  const phaseZero = await getStudentRecruitmentJourney(ids.student, ids.application, deps(app({ currentPhase: 0, currentStatus: 'applied' }), baseDrive(1)))
  assert.deepEqual([phaseZero.currentPhase, phaseZero.currentPhaseExecution, phaseZero.phases.length], [null, null, 1])
  const five = await getStudentRecruitmentJourney(ids.student, ids.application, deps(app({ currentPhase: 5, currentStatus: 'active' }), baseDrive(5)))
  assert.deepEqual([five.currentPhase.phaseNumber, five.phases.length, five.currentPhaseExecution], [5, 5, null])
})

test('terminal and inactive statuses keep history but hide active resources', async () => {
  for (const status of ['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere', 'placement_confirmed']) {
    const result = await getStudentRecruitmentJourney(ids.student, ids.application, deps(app({ currentStatus: status })))
    assert.equal(result.currentPhaseExecution, null)
    assert.equal(result.application.phaseHistory.length, 3)
  }
  const selected = await getStudentRecruitmentJourney(ids.student, ids.application, deps(app({ currentStatus: 'selected_pending_confirmation' })))
  assert.ok(selected.currentPhaseExecution)
})

test('backward corrections and selected-to-unselected history remain chronological and truthful', async () => {
  const history = [...app().phaseHistory, { phase: 1, status: 'active', event: 'moved_backward', occurredAt: new Date('2032-01-03T09:00:00.000Z'), note: 'Internal correction' }, { phase: 2, status: 'active', event: 'advanced', occurredAt: new Date('2032-01-04T09:00:00.000Z') }, { phase: 2, status: 'selected_pending_confirmation', event: 'provisionally_selected', occurredAt: new Date('2032-01-05T09:00:00.000Z') }, { phase: 2, status: 'active', event: 'unselected', occurredAt: new Date('2032-01-06T09:00:00.000Z') }]
  const result = await getStudentRecruitmentJourney(ids.student, ids.application, deps(app({ phaseHistory: history })))
  assert.deepEqual(result.application.phaseHistory.map(item => item.event).slice(-4), ['moved_backward', 'advanced', 'provisionally_selected', 'unselected'])
  assert.equal(JSON.stringify(result).includes('Internal correction'), false)
})

test('Student ownership and current-phase access reject another Student and stale phase resources', async () => {
  await assert.rejects(getStudentRecruitmentJourney(ids.other, ids.application, deps()), error => error.errorCode === 'NOT_FOUND')
  await assert.rejects(getStudentCurrentPhaseExecution(ids.student, ids.application, deps(app({ currentPhase: 3, currentStatus: 'absent' }))), error => error.errorCode === 'FORBIDDEN')
  const moved = await getStudentCurrentPhaseExecution(ids.student, ids.application, deps(app({ currentPhase: 3, currentStatus: 'active' })))
  assert.deepEqual([moved.phase.phaseNumber, moved.execution.resources[0].label], [3, 'Future test'])
})

test('M6 withdrawal remains valid from an active M7 phase and removes current-phase access', async () => {
  const candidate = { ...app(), async save() { return this } }
  const withdrawn = await withdrawStudentApplication(ids.student, ids.application, { applicationModel: { findOne: async () => candidate }, now: new Date('2032-01-03T10:00:00.000Z') })
  assert.deepEqual([withdrawn.application.currentStatus, withdrawn.application.phaseHistory.at(-1).event], ['withdrawn', 'withdrawn'])
  await assert.rejects(getStudentCurrentPhaseExecution(ids.student, ids.application, deps(candidate)), error => error.errorCode === 'FORBIDDEN')
})
