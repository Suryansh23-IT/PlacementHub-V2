import assert from 'node:assert/strict'
import test from 'node:test'
import { sendCompanyPhaseCandidatesNotification } from '../src/modules/notifications/notification.service.js'
import { phaseExecutionUpdateSchema } from '../src/modules/recruitment/recruitment-workspace.validation.js'
import { exportCompanyRecruitmentCandidates } from '../src/modules/recruitment/recruitment-export.service.js'
import { getStudentCurrentPhaseExecution } from '../src/modules/applications/student-placement-drive.service.js'

const ids = { companyUser: '507f1f77bcf86cd799439101', otherCompanyUser: '507f1f77bcf86cd799439102', company: '507f1f77bcf86cd799439103', drive: '507f1f77bcf86cd799439104', application: '507f1f77bcf86cd799439105', student: '507f1f77bcf86cd799439106', otherStudent: '507f1f77bcf86cd799439107' }
const requestId = '0e58d815-29dd-4aec-8190-fc551f3a2ea8'
const drive = { _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Engineer' }, phases: [{ phaseNumber: 1, title: 'Assessment', type: 'assessment' }, { phaseNumber: 2, title: 'Interview', type: 'technical_interview' }], phaseExecution: [{ phaseNumber: 1, status: 'scheduled', mode: 'online', resources: [{ type: 'test_link', label: 'HackerRank', url: 'https://example.test/test' }], instructionPdf: { originalName: 'instructions.pdf', storagePath: '/private/instructions.pdf', mimeType: 'application/pdf', size: 100, uploadedAt: new Date() } }] }
const application = (studentId, overrides = {}) => ({ _id: `${ids.application}${studentId.slice(-1)}`, studentId, placementDriveId: ids.drive, currentPhase: 1, currentStatus: 'active', appliedAt: new Date(), ...overrides })
const query = values => ({ select: () => ({ lean: async () => values }), lean: async () => values, sort: async () => values })

function notificationDependencies(applications = [application(ids.student)], created = []) {
  return {
    companyModel: { findOne: async filter => filter.userId === ids.companyUser ? { _id: ids.company, companyName: 'Acme' } : null },
    placementDriveModel: { findOne: async filter => filter._id === ids.drive && filter.companyId === ids.company ? drive : null },
    applicationModel: { find: filter => query(applications.filter(item => (!filter.currentPhase || item.currentPhase === filter.currentPhase) && (!filter.currentStatus || item.currentStatus === filter.currentStatus))) },
    notificationModel: { find: () => query([]), create: async items => { created.push(...items); return items } },
  }
}

test('phase messages target only candidates actively in the exact phase at send time', async () => {
  const created = []; const apps = [application(ids.student), application(ids.otherStudent, { currentPhase: 2 }), application('507f1f77bcf86cd799439108', { currentStatus: 'rejected' }), application('507f1f77bcf86cd799439109', { currentStatus: 'absent' })]
  const result = await sendCompanyPhaseCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, phaseNumber: 1, title: 'Assessment details', message: 'Use the HackerRank link.', requestId }, notificationDependencies(apps, created))
  assert.deepEqual([result.notificationsCreated, result.recipientCount], [1, 1])
  assert.deepEqual(created.map(item => item.recipientId), [ids.student])
  assert.deepEqual([created[0].phaseNumber, created[0].context.audience, created[0].context.roleTitle], [1, 'phase_candidates', 'Engineer'])
})

test('a current database move changes the phase recipient set and zero recipients is safe', async () => {
  const moved = application(ids.student, { currentPhase: 2 }); const created = []
  const result = await sendCompanyPhaseCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, phaseNumber: 1, title: 'Updated details', message: 'Check the updated schedule.', requestId: 'e0aefcc8-2087-42d5-a1bc-28e292fbda5c' }, notificationDependencies([moved], created))
  assert.deepEqual([result.notificationsCreated, result.recipientCount], [0, 0]); assert.equal(created.length, 0)
})

test('phase message authorization preserves Company ownership and idempotent request batches', async () => {
  await assert.rejects(sendCompanyPhaseCandidatesNotification(ids.otherCompanyUser, { placementDriveId: ids.drive, phaseNumber: 1, title: 'No access', message: 'This must not send.', requestId }, notificationDependencies()), error => error.errorCode === 'FORBIDDEN')
  const prior = [application(ids.student)]; const dependencies = notificationDependencies()
  dependencies.notificationModel.find = () => query(prior)
  const result = await sendCompanyPhaseCandidatesNotification(ids.companyUser, { placementDriveId: ids.drive, phaseNumber: 1, title: 'Retry', message: 'This must not duplicate.', requestId }, dependencies)
  assert.deepEqual([result.alreadySent, result.notificationsCreated], [true, 1])
})

test('phase execution validates external URLs and preserves the approved blueprint shape', () => {
  assert.equal(phaseExecutionUpdateSchema.safeParse({ resources: [{ type: 'test_link', label: 'Test', url: 'javascript:alert(1)' }] }).success, false)
  assert.equal(phaseExecutionUpdateSchema.safeParse({ resources: [{ type: 'meeting_link', label: 'Meet', url: 'https://meet.google.com/example' }] }).success, true)
  assert.deepEqual(drive.phases.map(phase => phase.title), ['Assessment', 'Interview'])
})

test('Student receives only their current phase execution and never private attachment storage paths', async () => {
  const result = await getStudentCurrentPhaseExecution(ids.student, ids.application, { applicationModel: { findOne: async filter => filter.studentId === ids.student ? application(ids.student, { _id: ids.application }) : null }, placementDriveModel: { findOne: async () => drive } })
  assert.deepEqual([result.phase.phaseNumber, result.execution.resources.length], [1, 1])
  assert.match(result.execution.instructionPdf.downloadUrl, /current-phase\/instruction-pdf\/download$/)
  assert.equal(JSON.stringify(result).includes('/private/instructions.pdf'), false)
  await assert.rejects(getStudentCurrentPhaseExecution(ids.otherStudent, ids.application, { applicationModel: { findOne: async () => null } }), error => error.errorCode === 'NOT_FOUND')
  await assert.rejects(getStudentCurrentPhaseExecution(ids.student, ids.application, { applicationModel: { findOne: async () => application(ids.student, { _id: ids.application, currentStatus: 'rejected' }) } }), error => error.errorCode === 'FORBIDDEN')
})

test('Company export is in-memory xlsx and remains scoped to its own drive', async () => {
  const dependencies = {
    companyModel: { findOne: async filter => filter.userId === ids.companyUser ? { _id: ids.company, companyName: 'Acme' } : null },
    placementDriveModel: { findOne: async filter => filter.companyId === ids.company ? drive : null },
    applicationModel: { find: () => ({ sort: async () => [application(ids.student)] }) },
    userModel: { findOne: async () => ({ name: 'Asha', email: 'asha@example.test' }) },
    profileModel: { findOne: async () => ({ rollNumber: 'R1', branch: 'CSE', cgpa: 8.5 }) },
  }
  const exported = await exportCompanyRecruitmentCandidates(ids.companyUser, ids.drive, { phase: 1, selectedOnly: false }, dependencies)
  assert.equal(exported.rowCount, 1); assert.equal(exported.buffer.subarray(0, 2).toString(), 'PK'); assert.match(exported.filename, /phase-1-candidates\.xlsx$/)
  await assert.rejects(exportCompanyRecruitmentCandidates(ids.otherCompanyUser, ids.drive, { phase: 1, selectedOnly: false }, dependencies), error => error.errorCode === 'FORBIDDEN')
})
