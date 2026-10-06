import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmPlacementRecord, decidePlacementRecord, getPlacementProof, submitPlacementReport } from '../src/modules/placements/placement-record.service.js'

const ids = { student: '507f1f77bcf86cd799439101', otherStudent: '507f1f77bcf86cd799439102', application: '507f1f77bcf86cd799439103', tcs: '507f1f77bcf86cd799439104', infosys: '507f1f77bcf86cd799439105', drive: '507f1f77bcf86cd799439106', company: '507f1f77bcf86cd799439107', admin: '507f1f77bcf86cd799439108' }
const saveable = value => ({ ...value, save: async function () { return this } })
const report = { outcomeType: 'full_time', location: 'Bengaluru', joiningPeriod: 'July 2027' }
function dependencies({ record = null, application = saveable({ _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, currentPhase: 2, currentStatus: 'selected_pending_confirmation', phaseHistory: [] }), others = [] } = {}) {
  return { recordModel: { findOne: async query => query._id && query._id !== 'record' ? null : record, create: async value => saveable({ _id: 'record', ...value }) }, driveModel: { findOne: async () => ({ _id: ids.drive, companyId: ids.company, role: { title: 'Engineer' } }) }, applicationModel: { findOne: async query => query.studentId && query.studentId !== ids.student ? null : application, find: async () => others }, notificationService: async () => [] }
}
test('only the selected student application can create or update one pending PlacementRecord', async () => {
  const first = await submitPlacementReport(ids.student, ids.application, report, dependencies())
  assert.equal(first.verificationState, 'pending_admin_verification')
  await assert.rejects(submitPlacementReport(ids.otherStudent, ids.application, report, dependencies()), error => error.errorCode === 'NOT_FOUND')
  const existing = saveable({ ...first, verificationState: 'pending_admin_verification', history: [] })
  const updated = await submitPlacementReport(ids.student, ids.application, { ...report, location: 'Pune' }, dependencies({ record: existing }))
  assert.equal(updated.location, 'Pune')
})
test('admin confirmation is idempotent, confirms the source application, and closes other active journeys', async () => {
  const record = saveable({ _id: 'record', studentId: ids.student, applicationId: ids.application, placementDriveId: ids.drive, companyId: ids.company, outcomeType: 'full_time', verificationState: 'pending_admin_verification', history: [] })
  const tcs = saveable({ _id: ids.tcs, studentId: ids.student, currentPhase: 2, currentStatus: 'active', phaseHistory: [] }); const infosys = saveable({ _id: ids.infosys, studentId: ids.student, currentPhase: 1, currentStatus: 'active', phaseHistory: [] })
  const result = await confirmPlacementRecord(ids.admin, 'record', {}, dependencies({ record, others: [tcs, infosys] }))
  assert.deepEqual([result.alreadyConfirmed, result.closedApplications, record.verificationState], [false, 2, 'confirmed']); assert.equal(tcs.currentStatus, 'closed_placed_elsewhere'); assert.equal(infosys.currentStatus, 'closed_placed_elsewhere')
  assert.equal((await confirmPlacementRecord(ids.admin, 'record', {}, dependencies({ record })).then(value => value.alreadyConfirmed)), true)
})
test('internship confirmation closes other active recruitment journeys just like PPO', async () => {
  const active = saveable({ _id: ids.tcs, studentId: ids.student, currentPhase: 2, currentStatus: 'active', phaseHistory: [] })
  const internship = saveable({ _id: 'record', studentId: ids.student, applicationId: ids.application, placementDriveId: ids.drive, companyId: ids.company, outcomeType: 'internship', verificationState: 'pending_admin_verification', history: [] })
  await confirmPlacementRecord(ids.admin, 'record', {}, dependencies({ record: internship, others: [active] })); assert.equal(active.currentStatus, 'closed_placed_elsewhere')
  const ppo = saveable({ _id: 'record', studentId: ids.student, applicationId: ids.application, placementDriveId: ids.drive, companyId: ids.company, outcomeType: 'ppo', verificationState: 'pending_admin_verification', history: [] })
  await confirmPlacementRecord(ids.admin, 'record', {}, dependencies({ record: ppo, others: [active] })); assert.equal(active.currentStatus, 'closed_placed_elsewhere')
})
test('revocation preserves history and never reopens previously closed applications', async () => {
  const record = saveable({ _id: 'record', verificationState: 'confirmed', history: [] }); const revoked = await decidePlacementRecord(ids.admin, 'record', 'revoke', 'Offer withdrawn', { recordModel: { findOne: async () => record } }); assert.equal(revoked.verificationState, 'revoked'); assert.equal(revoked.history.at(-1).event, 'admin_revoked')
})
test('proof reads are scoped to the record owner or Placement Admin', async () => {
  const record = { _id: 'record', studentId: ids.student, proof: [{ originalName: 'offer.pdf', storagePath: '/private/offer.pdf' }] }
  const model = { findOne: async query => query.studentId && query.studentId !== ids.student ? null : record }
  assert.equal((await getPlacementProof(ids.student, 'record', 0, { recordModel: model })).originalName, 'offer.pdf')
  await assert.rejects(getPlacementProof(ids.otherStudent, 'record', 0, { recordModel: model }), error => error.errorCode === 'NOT_FOUND')
  assert.equal((await getPlacementProof(ids.admin, 'record', 0, { recordModel: model, isAdmin: true })).originalName, 'offer.pdf')
})
test('a retry repairs a confirmed record when source Application persistence previously failed', async () => {
  const source = saveable({ _id: ids.application, studentId: ids.student, placementDriveId: ids.drive, currentPhase: 2, currentStatus: 'selected_pending_confirmation', phaseHistory: [] })
  const record = saveable({ _id: 'record', studentId: ids.student, applicationId: ids.application, placementDriveId: ids.drive, companyId: ids.company, outcomeType: 'full_time', verificationState: 'confirmed', history: [{ event: 'admin_confirmed' }] })
  const result = await confirmPlacementRecord(ids.admin, 'record', {}, dependencies({ record, application: source }))
  assert.deepEqual([result.alreadyConfirmed, result.repaired, source.currentStatus], [true, true, 'placement_confirmed'])
})
