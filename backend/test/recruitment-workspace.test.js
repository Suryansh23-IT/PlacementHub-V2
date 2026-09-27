import assert from 'node:assert/strict'
import test from 'node:test'
import { bulkTransitionCompanyRecruitmentCandidates, getCompanyRecruitmentWorkspace, listCompanyRecruitmentActivity, listCompanyRecruitmentCandidates, updateCompanyPhaseExecution } from '../src/modules/recruitment/recruitment-workspace.service.js'

const ids = { user: '507f1f77bcf86cd799439101', other: '507f1f77bcf86cd799439102', company: '507f1f77bcf86cd799439103', drive: '507f1f77bcf86cd799439104', student: '507f1f77bcf86cd799439105' }
const drive = phases => ({ _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Engineer' }, phases: Array.from({ length: phases }, (_, index) => ({ phaseNumber: index + 1, title: `Round ${index + 1}` })), phaseExecution: [], async save () { return this } })
const app = (overrides = {}) => ({ _id: '507f1f77bcf86cd799439106', studentId: ids.student, placementDriveId: ids.drive, currentPhase: 0, currentStatus: 'applied', appliedAt: new Date('2031-03-01'), phaseHistory: [], async save () { return this }, ...overrides })
function deps({ phases = 1, applications = [app()], company = { _id: ids.company } } = {}) { const placementDrive = drive(phases); return { companyModel: { findOne: async query => query.userId === ids.user ? company : null }, placementDriveModel: { findOne: async () => placementDrive }, applicationModel: { find: query => applications.filter(item => (query.currentPhase === undefined || item.currentPhase === query.currentPhase) && (query.currentStatus === undefined || item.currentStatus === query.currentStatus)) }, userModel: { findOne: async () => ({ name: 'Asha' }) }, profileModel: { findOne: async () => ({ rollNumber: 'R1', branch: 'CSE', cgpa: 8.5 }) }, placementDrive } }

test('company workspace supports dynamic 1-phase and 5-phase Drive blueprints', async () => {
  const one = deps({ phases: 1 }); const five = deps({ phases: 5 })
  assert.equal((await getCompanyRecruitmentWorkspace(ids.user, ids.drive, one)).drive.phases.length, 1)
  assert.equal((await getCompanyRecruitmentWorkspace(ids.user, ids.drive, five)).phaseCounts.length, 6)
})
test('candidate filtering returns only the requested phase and provisional selected candidates', async () => {
  const first = app(); const selected = app({ _id: '507f1f77bcf86cd799439107', currentPhase: 1, currentStatus: 'selected_pending_confirmation' })
  const dependencies = deps({ applications: [first, selected] })
  const phaseZero = await listCompanyRecruitmentCandidates(ids.user, ids.drive, { phase: 0 }, dependencies)
  const selections = await listCompanyRecruitmentCandidates(ids.user, ids.drive, { status: 'selected_pending_confirmation' }, dependencies)
  assert.equal(phaseZero.candidates.length, 1)
  assert.equal(selections.candidates[0].currentStatus, 'selected_pending_confirmation')
})
test('cross-company workspace access is denied and runtime execution leaves blueprint intact', async () => {
  const denied = deps(); await assert.rejects(getCompanyRecruitmentWorkspace(ids.other, ids.drive, denied), error => error.errorCode === 'FORBIDDEN')
  const dependencies = deps({ phases: 2 }); const before = structuredClone(dependencies.placementDrive.phases)
  const execution = await updateCompanyPhaseExecution(ids.user, ids.drive, 2, { status: 'scheduled', mode: 'online', venue: 'Lab', resources: [] }, dependencies)
  assert.equal(execution.status, 'scheduled'); assert.deepEqual(dependencies.placementDrive.phases, before)
})
test('activity is derived from phase history without a separate collection', async () => {
  const dependencies = deps({ applications: [app({ phaseHistory: [{ phase: 1, status: 'active', event: 'advanced', occurredAt: new Date('2031-03-02') }, { phase: 1, status: 'rejected', event: 'rejected', occurredAt: new Date('2031-03-03') }] })] })
  const result = await listCompanyRecruitmentActivity(ids.user, ids.drive, dependencies)
  assert.equal(result.events.length, 2); assert.equal(result.events[0].action, 'rejected')
})
test('bulk transitions isolate a stale or invalid candidate failure from successful candidates', async () => {
  const valid = app(); const invalid = app({ _id: '507f1f77bcf86cd799439107', currentStatus: 'withdrawn' })
  const dependencies = deps({ applications: [valid, invalid] })
  dependencies.applicationModel.findOne = async query => [valid, invalid].find(item => item._id === query._id && item.placementDriveId === query.placementDriveId) ?? null
  const result = await bulkTransitionCompanyRecruitmentCandidates(ids.user, ids.drive, [valid._id, invalid._id], { action: 'advance', targetPhase: 1 }, dependencies)
  assert.deepEqual([result.succeeded, result.failed], [1, 1])
  assert.equal(result.results[1].error.errorCode, 'CONFLICT')
})
