import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm6-admin-monitoring-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { getAdminPublishedDriveMonitoring, listAdminPublishedDriveMonitoring } = await import('../src/modules/applications/admin-drive-monitoring.service.js')

const ids = { drive: '507f1f77bcf86cd799439101', hidden: '507f1f77bcf86cd799439102', company: '507f1f77bcf86cd799439103', student: '507f1f77bcf86cd799439104', otherStudent: '507f1f77bcf86cd799439105' }
const drive = { _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Software Engineer', domain: 'Engineering' }, driveDetails: { applicationDeadline: new Date('2027-02-01'), workLocation: 'Raipur' }, eligibility: { allowedBranches: ['Information Technology'], minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] }, phases: [{ phaseNumber: 1, title: 'Assessment', type: 'assessment' }] }
const applications = [
  { _id: 'application-1', placementDriveId: ids.drive, studentId: ids.student, appliedAt: new Date('2027-01-10'), currentPhase: 0, currentStatus: 'applied' },
  { _id: 'application-2', placementDriveId: ids.drive, studentId: ids.otherStudent, appliedAt: new Date('2027-01-09'), currentPhase: 0, currentStatus: 'applied' },
  { _id: 'application-3', placementDriveId: ids.drive, studentId: ids.otherStudent, appliedAt: new Date('2027-01-08'), currentPhase: 0, currentStatus: 'withdrawn' },
]

function dependencies() {
  const drives = [drive, { ...drive, _id: ids.hidden, lifecycleStatus: 'unpublished' }]
  const matches = (item, query) => Object.entries(query).every(([key, value]) => String(item[key]) === String(value))
  return {
    placementDriveModel: { find: query => ({ sort: async () => drives.filter(item => matches(item, query)) }), findOne: async query => drives.find(item => matches(item, query)) ?? null },
    applicationModel: { countDocuments: async ({ placementDriveId, currentStatus }) => applications.filter(item => item.placementDriveId === placementDriveId && (currentStatus == null || (currentStatus.$ne ? item.currentStatus !== currentStatus.$ne : item.currentStatus === currentStatus))).length, find: ({ placementDriveId }) => ({ sort: async () => applications.filter(item => item.placementDriveId === placementDriveId) }) },
    companyModel: { findOne: async ({ _id }) => _id === ids.company ? { companyName: 'Acme Technologies', industry: 'Software', officialEmail: 'careers@acme.example', location: 'Raipur' } : null },
    userModel: { findOne: async ({ _id, role }) => role === 'student' && [ids.student, ids.otherStudent].includes(_id) ? { _id, name: _id === ids.student ? 'Priya Student' : 'Aman Student' } : null },
    profileModel: { findOne: async ({ userId }) => [ids.student, ids.otherStudent].includes(userId) ? { userId, rollNumber: userId === ids.student ? '21115001' : '21115002', branch: 'Information Technology', resume: { storagePath: '/private/resume.pdf' }, skills: ['React'] } : null },
  }
}

test('Admin monitoring list contains only published drives with aggregate application counts', async () => {
  const list = await listAdminPublishedDriveMonitoring(dependencies())
  assert.equal(list.length, 1)
  assert.equal(list[0]._id, ids.drive)
  assert.equal(list[0].company.companyName, 'Acme Technologies')
  assert.equal(list[0].applicationCount, 3)
  assert.equal(list[0].activeApplicantCount, 2)
  assert.equal(list[0].exitedApplicantCount, 1)
  assert.equal(list[0].lifecycleStatus, 'published')
})

test('Admin monitoring detail reuses Application records and keeps Student data lightweight', async () => {
  const data = await getAdminPublishedDriveMonitoring(ids.drive, dependencies())
  assert.equal(data.applicationCount, 3)
  assert.equal(data.students.length, 3)
  assert.equal(data.students[0].name, 'Priya Student')
  assert.equal(data.students[0].rollNumber, '21115001')
  assert.equal(data.students[0].currentPhase, 0)
  assert.equal(data.students[0].currentStatus, 'applied')
  assert.equal(data.students[0].resume, undefined)
  assert.equal(data.students[0].skills, undefined)
})

test('Admin monitoring does not expose unpublished drives', async () => {
  await assert.rejects(getAdminPublishedDriveMonitoring(ids.hidden, dependencies()), { errorCode: 'NOT_FOUND' })
})

test('Company accounts cannot access the Admin monitoring routes', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ids.company, role: 'company', isActive: true }) }))
  const server = app.listen(0)
  try {
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: ids.company, expiresIn: '1h' })}` }
    const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/placement-drives/monitoring`
    assert.equal((await fetch(url, { headers })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
