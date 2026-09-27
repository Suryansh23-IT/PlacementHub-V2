import assert from 'node:assert/strict'
import test from 'node:test'

import { getAdminPublishedDriveMonitoring } from '../src/modules/applications/admin-drive-monitoring.service.js'
import { getCompanyRecruitmentWorkspace, listCompanyRecruitmentActivity } from '../src/modules/recruitment/recruitment-workspace.service.js'

const ids = { companyUser: 'company-user', otherCompanyUser: 'other-company-user', company: 'company', drive: 'drive', student: 'student', otherStudent: 'other-student' }
const history = (event, phase, status, at, note) => ({ event, phase, status, occurredAt: new Date(at), ...(note ? { note } : {}) })
const application = (id, overrides = {}) => ({ _id: id, placementDriveId: ids.drive, studentId: id === 'a2' ? ids.otherStudent : ids.student, currentPhase: 0, currentStatus: 'applied', appliedAt: new Date('2032-01-01'), phaseHistory: [history('applied', 0, 'applied', '2032-01-01')], ...overrides })
const drive = (phaseCount = 1) => ({ _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Engineer' }, driveDetails: {}, phases: Array.from({ length: phaseCount }, (_, index) => ({ phaseNumber: index + 1, title: `Phase ${index + 1}` })), phaseExecution: [] })

function dependencies({ applications = [], records = [], phaseCount = 1, owner = true } = {}) {
  const currentDrive = drive(phaseCount)
  const user = id => ({ _id: id, name: id === ids.otherStudent ? 'Other Student' : 'Asha Student', role: 'student' })
  return {
    companyModel: { findOne: async query => query.userId ? (owner && query.userId === ids.companyUser ? { _id: ids.company, userId: ids.companyUser, approvalStatus: 'approved', companyName: 'Acme' } : null) : query._id === ids.company ? { _id: ids.company, companyName: 'Acme' } : null },
    placementDriveModel: { findOne: async query => String(query._id) === ids.drive && (!query.companyId || String(query.companyId) === ids.company) ? currentDrive : null },
    applicationModel: { find: () => ({ sort: async () => applications }) },
    placementRecordModel: { find: () => records },
    userModel: { findOne: async ({ _id, role }) => role === 'student' && [_idsSafe(ids.student), _idsSafe(ids.otherStudent)].includes(_id) ? user(_id) : null },
    profileModel: { findOne: async ({ userId }) => [_idsSafe(ids.student), _idsSafe(ids.otherStudent)].includes(userId) ? { userId, rollNumber: userId === ids.otherStudent ? 'R2' : 'R1', branch: userId === ids.otherStudent ? 'ECE' : 'CSE', cgpa: 8.2 } : null },
  }
}
function _idsSafe(value) { return value }

test('M7F funnels are dynamic for empty, Phase 0-only, one-phase, five-phase, and empty-middle Drive states', async () => {
  const empty = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ phaseCount: 5 }))
  assert.equal(empty.funnel.totalApplicants, 0)
  assert.deepEqual(empty.funnel.phases.map(item => item.count), [0, 0, 0, 0, 0, 0])
  const apps = [application('a1', { currentPhase: 0, currentStatus: 'applied' }), application('a2', { currentPhase: 5, currentStatus: 'active' })]
  const five = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ applications: apps, phaseCount: 5 }))
  assert.deepEqual(five.funnel.phases.map(item => item.count), [1, 0, 0, 0, 0, 1])
  const one = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ applications: [application('a1', { currentPhase: 1, currentStatus: 'active' })], phaseCount: 1 }))
  assert.deepEqual(one.funnel.phases.map(item => item.phaseNumber), [0, 1])
})

test('M7F funnels derive current buckets from Applications and PlacementRecords rather than history', async () => {
  const apps = [
    application('a1', { currentPhase: 1, currentStatus: 'active' }), application('a2', { currentPhase: 1, currentStatus: 'rejected' }),
    application('a3', { currentPhase: 2, currentStatus: 'absent' }), application('a4', { currentPhase: 2, currentStatus: 'withdrawn' }),
    application('a5', { currentPhase: 3, currentStatus: 'closed_placed_elsewhere' }), application('a6', { currentPhase: 5, currentStatus: 'selected_pending_confirmation' }),
    application('a7', { currentPhase: 5, currentStatus: 'placement_confirmed' }),
  ]
  const records = [
    { applicationId: 'a6', placementDriveId: ids.drive, verificationState: 'pending_admin_verification' },
    { applicationId: 'a7', placementDriveId: ids.drive, verificationState: 'confirmed' },
  ]
  const workspace = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ applications: apps, records, phaseCount: 5 }))
  assert.deepEqual({ active: workspace.funnel.activeCandidates, exited: workspace.funnel.exitedTotal, selected: workspace.funnel.provisionalSelected, pending: workspace.funnel.confirmationPending, confirmed: workspace.funnel.placementConfirmed }, { active: 1, exited: 4, selected: 1, pending: 1, confirmed: 1 })
  assert.deepEqual({ rejected: workspace.funnel.rejected, absent: workspace.funnel.absent, withdrawn: workspace.funnel.withdrawn, closed: workspace.funnel.closedElsewhere }, { rejected: 1, absent: 1, withdrawn: 1, closed: 1 })
})

test('M7F count changes reflect each current transition state, including restore, unselect, confirm, closure, and revoke', async () => {
  const states = [
    ['applied', 0, 1, 0], ['active', 1, 1, 0], ['rejected', 1, 0, 1], ['absent', 1, 0, 1], ['withdrawn', 1, 0, 1],
    ['selected_pending_confirmation', 1, 0, 0], ['closed_placed_elsewhere', 1, 0, 1], ['placement_confirmed', 1, 0, 0],
  ]
  for (const [currentStatus, currentPhase, active, exited] of states) {
    const records = currentStatus === 'placement_confirmed' ? [{ applicationId: 'a1', placementDriveId: ids.drive, verificationState: 'confirmed' }] : []
    const result = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ applications: [application('a1', { currentStatus, currentPhase })], records, phaseCount: 1 }))
    assert.equal(result.funnel.activeCandidates, active, currentStatus)
    assert.equal(result.funnel.exitedTotal, exited, currentStatus)
  }
  const revoked = await getCompanyRecruitmentWorkspace(ids.companyUser, ids.drive, dependencies({ applications: [application('a1', { currentStatus: 'closed_placed_elsewhere', currentPhase: 1 })], records: [{ applicationId: 'a1', placementDriveId: ids.drive, verificationState: 'revoked' }] }))
  assert.equal(revoked.funnel.activeCandidates, 0)
  assert.equal(revoked.funnel.closedElsewhere, 1)
})

test('M7F activity is chronological, includes Application and placement lifecycle events, and removes private notes', async () => {
  const app = application('a1', { currentPhase: 1, currentStatus: 'placement_confirmed', phaseHistory: [history('applied', 0, 'applied', '2032-01-01'), history('advanced', 1, 'active', '2032-01-02', 'private recruiter note'), history('closed_placed_elsewhere', 1, 'closed_placed_elsewhere', '2032-01-03', 'private reason')] })
  const records = [{ applicationId: 'a1', studentId: ids.student, placementDriveId: ids.drive, history: [{ event: 'admin_confirmed', occurredAt: new Date('2032-01-04'), note: 'private admin rationale' }, { event: 'admin_revoked', occurredAt: new Date('2032-01-05'), note: 'private revocation rationale' }] }]
  const result = await listCompanyRecruitmentActivity(ids.companyUser, ids.drive, dependencies({ applications: [app], records }))
  assert.deepEqual(result.events.map(event => event.action), ['placement_revoked', 'placement_confirmed', 'closed_placed_elsewhere', 'advanced', 'applied'])
  assert.ok(result.events.every(event => event.note === undefined && event.reason === undefined && event.storagePath === undefined && event.at))
  assert.ok(result.events.every(event => event.student?.name && event.phase != null && event.status))
})

test('M7F Company workspace retains ownership isolation and Admin monitoring has lightweight confirmation state', async () => {
  await assert.rejects(getCompanyRecruitmentWorkspace(ids.otherCompanyUser, ids.drive, dependencies()), error => error.errorCode === 'FORBIDDEN')
  const apps = [application('a1', { currentPhase: 1, currentStatus: 'selected_pending_confirmation' })]
  const records = [{ applicationId: 'a1', placementDriveId: ids.drive, verificationState: 'pending_admin_verification' }]
  const deps = dependencies({ applications: apps, records })
  const admin = await getAdminPublishedDriveMonitoring(ids.drive, { ...deps, placementDriveModel: { findOne: async () => drive(1) } })
  assert.equal(admin.funnel.confirmationPending, 1)
  assert.equal(admin.students[0].confirmationState, 'pending_admin_verification')
  assert.equal(admin.students[0].cgpa, undefined)
})
