import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-drive-lifecycle'
process.env.JWT_SECRET = 'drive-lifecycle-secret-long-enough-for-tests'

const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { StudentPlacementPolicy, StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')

const DB = 'mongodb://127.0.0.1:27017/placementhub-v2-drive-lifecycle'
const SECRET = process.env.JWT_SECRET
const auth = id => ({ Authorization: `Bearer ${jwt.sign({}, SECRET, { subject: String(id), expiresIn: '1h' })}` })
const json = id => ({ ...auth(id), 'Content-Type': 'application/json' })
const document = name => ({ originalName: `${name}.pdf`, storagePath: `/private/${name}.pdf`, mimeType: 'application/pdf', size: 100, uploadedAt: new Date() })

async function createUser(name, role) { return User.create({ name, email: `${name.toLowerCase().replaceAll(' ', '.')}@lifecycle.test`, role, passwordHash: 'test-hash' }) }
async function createDrive(companyId, phases = 5) {
  return PlacementDrive.create({
    companyId, proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: new Date(),
    role: { title: `${phases}-phase Engineer`, employmentType: 'full_time', description: 'Lifecycle regression Drive.', requiredSkills: [] },
    driveDetails: { workMode: 'online', workLocation: 'Remote', expectedHires: 2, compensation: { currency: 'INR', period: 'not_disclosed' }, applicationDeadline: new Date(Date.now() + 86400000 * 10) },
    eligibility: { minimumCgpa: 7, allowedBranches: ['CSE'], maximumActiveBacklogs: 0, graduationYears: [2027] },
    phases: Array.from({ length: phases }, (_, index) => ({ phaseNumber: index + 1, title: `Phase ${index + 1}`, type: index ? 'technical_interview' : 'assessment' })),
    phaseExecution: [{ phaseNumber: 1, status: 'scheduled', instructions: 'Preserve this runtime state.', instructionPdf: document('phase-one') }],
    documents: { companyRecruitmentInformation: document('company'), placementDriveJobDescription: document('jd') },
  })
}

test('Admin Drive lifecycle routes postpone and cancel without mutating recruitment records', async t => {
  await mongoose.connect(DB)
  await mongoose.connection.db.dropDatabase()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.connection.db.dropDatabase(); await mongoose.disconnect() })

  const admin = await createUser('Lifecycle Admin', 'placement_admin')
  const companyUser = await createUser('Lifecycle Company', 'company')
  const student = await createUser('Lifecycle Student', 'student')
  const otherStudent = await createUser('Future Student', 'student')
  const company = await Company.create({ userId: companyUser._id, companyName: 'Lifecycle Company', approvalStatus: 'approved' })
  const policy = await StudentPlacementPolicy.create({ title: 'Lifecycle Policy', academicYear: '2034-35', version: '1', policyText: 'Policy.', active: true })
  for (const [index, user] of [student, otherStudent].entries()) {
    await StudentProfile.create({ userId: user._id, branch: 'CSE', graduationYear: 2027, cgpa: 8, activeBacklogs: 0, verificationStatus: 'verified', rollNumber: `L${index + 1}`, resume: document(`resume-${index}`), collegeResult: document(`result-${index}`) })
    await StudentPolicyAcceptance.create({ studentId: user._id, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date() })
  }
  const drive = await createDrive(company._id, 5)
  const application = await Application.create({ studentId: student._id, placementDriveId: drive._id, currentPhase: 2, currentStatus: 'active', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date() }, { phase: 1, status: 'active', event: 'advanced', occurredAt: new Date() }, { phase: 2, status: 'active', event: 'advanced', occurredAt: new Date() }] })
  const record = await PlacementRecord.create({ studentId: student._id, applicationId: application._id, placementDriveId: drive._id, companyId: company._id, outcomeType: 'full_time', role: 'Engineer', verificationState: 'company_provisional', history: [] })
  const initialHistory = application.phaseHistory.map(item => item.toObject())

  let response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/postpone`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({}) })
  assert.equal(response.status, 422)
  for (const actor of [companyUser, student]) {
    response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/postpone`, { method: 'PATCH', headers: json(actor._id), body: JSON.stringify({ reason: 'Schedule change.' }) })
    assert.equal(response.status, 403)
  }

  response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/postpone`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Interview panel availability changed.' }) })
  assert.equal(response.status, 200)
  let payload = await response.json()
  assert.deepEqual([payload.data.drive.lifecycleStatus, payload.data.notificationsCreated, payload.data.alreadyChanged], ['postponed', 1, false])
  assert.equal(payload.data.drive.lifecycleHistory[0].actorId, undefined)
  response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/postpone`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Retry.' }) })
  assert.equal(response.status, 200)
  payload = await response.json()
  assert.deepEqual([payload.data.notificationsCreated, payload.data.alreadyChanged], [0, true])
  assert.equal(await Notification.countDocuments({ placementDriveId: drive._id, type: 'placement_drive_postponed' }), 1)

  response = await fetch(`${base}/companies/me/placement-drives/${drive._id}/recruitment`, { headers: auth(companyUser._id) })
  assert.equal(response.status, 200)
  response = await fetch(`${base}/admin/placement-drives/${drive._id}/monitoring`, { headers: auth(admin._id) })
  assert.equal(response.status, 200)
  response = await fetch(`${base}/students/me/applications/${application._id}/journey`, { headers: auth(student._id) })
  assert.equal(response.status, 200)
  payload = await response.json()
  assert.equal(payload.data.drive.lifecycleStatus, 'postponed')
  assert.equal(payload.data.currentPhaseExecution, null)
  response = await fetch(`${base}/companies/me/placement-drives/${drive._id}/recruitment/candidates/${application._id}/transition`, { method: 'POST', headers: json(companyUser._id), body: JSON.stringify({ action: 'advance', targetPhase: 3 }) })
  assert.equal(response.status, 409)
  response = await fetch(`${base}/companies/me/notifications/phase-candidates`, { method: 'POST', headers: json(companyUser._id), body: JSON.stringify({ placementDriveId: drive._id, phaseNumber: 2, title: 'Frozen message', message: 'This must not send.', requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }) })
  assert.equal(response.status, 404)

  response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/cancel`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Company cancelled campus hiring.' }) })
  assert.equal(response.status, 200)
  payload = await response.json()
  assert.deepEqual([payload.data.drive.lifecycleStatus, payload.data.notificationsCreated, payload.data.alreadyChanged], ['cancelled', 1, false])
  response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/cancel`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Retry.' }) })
  assert.equal(response.status, 200)
  assert.equal(await Notification.countDocuments({ placementDriveId: drive._id, type: 'placement_drive_cancelled' }), 1)
  response = await fetch(`${base}/students/me/placement-drives/${drive._id}/apply`, { method: 'POST', headers: auth(otherStudent._id) })
  assert.equal(response.status, 404)
  assert.equal(await Application.countDocuments({ studentId: otherStudent._id, placementDriveId: drive._id }), 0)
  response = await fetch(`${base}/companies/me/placement-drives/${drive._id}/recruitment/candidates/${application._id}/transition`, { method: 'POST', headers: json(companyUser._id), body: JSON.stringify({ action: 'reject', reason: 'Not allowed.' }) })
  assert.equal(response.status, 409)
  response = await fetch(`${base}/admin/placement-drives/${drive._id}/monitoring`, { headers: auth(admin._id) })
  assert.equal(response.status, 200)
  response = await fetch(`${base}/students/me/applications/${application._id}/journey`, { headers: auth(student._id) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.drive.lifecycleStatus, 'cancelled')

  const [savedDrive, savedApplication, savedRecord] = await Promise.all([PlacementDrive.findById(drive._id), Application.findById(application._id), PlacementRecord.findById(record._id)])
  assert.deepEqual(savedDrive.lifecycleHistory.map(item => item.event), ['postponed', 'cancelled'])
  assert.equal(savedDrive.phases.length, 5)
  assert.equal(savedDrive.phaseExecution[0].instructionPdf.storagePath, '/private/phase-one.pdf')
  assert.deepEqual(savedApplication.phaseHistory.map(item => item.toObject()), initialHistory)
  assert.deepEqual([savedApplication.currentPhase, savedApplication.currentStatus, savedRecord.verificationState], [2, 'active', 'company_provisional'])

  const onePhase = await createDrive(company._id, 1)
  response = await fetch(`${base}/admin/placement-drives/${onePhase._id}/lifecycle/cancel`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'One-phase Drive cancelled.' }) })
  assert.equal(response.status, 200)
  assert.equal((await PlacementDrive.findById(onePhase._id)).phases.length, 1)

  const closedDrive = await createDrive(company._id, 1)
  const closedApplication = await Application.create({ studentId: student._id, placementDriveId: closedDrive._id, currentPhase: 1, currentStatus: 'active', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date() }, { phase: 1, status: 'active', event: 'advanced', occurredAt: new Date() }] })
  response = await fetch(`${base}/admin/placement-drives/${closedDrive._id}/lifecycle/close`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Recruitment is complete.' }) })
  assert.equal(response.status, 200)
  payload = await response.json()
  assert.deepEqual([payload.data.drive.lifecycleStatus, payload.data.notificationsCreated, payload.data.alreadyChanged], ['completed', 1, false])
  response = await fetch(`${base}/admin/placement-drives/${closedDrive._id}/lifecycle/close`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'Retry.' }) })
  assert.equal(response.status, 200)
  assert.equal(await Notification.countDocuments({ placementDriveId: closedDrive._id, type: 'placement_drive_closed' }), 1)
  response = await fetch(`${base}/students/me/placement-drives/${closedDrive._id}/apply`, { method: 'POST', headers: auth(otherStudent._id) })
  assert.equal(response.status, 404)
  assert.equal(await Application.countDocuments({ studentId: otherStudent._id, placementDriveId: closedDrive._id }), 0)
  response = await fetch(`${base}/companies/me/placement-drives/${closedDrive._id}/recruitment/candidates/${closedApplication._id}/transition`, { method: 'POST', headers: json(companyUser._id), body: JSON.stringify({ action: 'reject', reason: 'Not allowed after closure.' }) })
  assert.equal(response.status, 409)
  response = await fetch(`${base}/admin/placement-drives/${closedDrive._id}/monitoring`, { headers: auth(admin._id) })
  assert.equal(response.status, 200)
  response = await fetch(`${base}/students/me/applications/${closedApplication._id}/journey`, { headers: auth(student._id) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.drive.lifecycleStatus, 'completed')
  response = await fetch(`${base}/admin/placement-drives/${drive._id}/lifecycle/resume`, { method: 'PATCH', headers: json(admin._id), body: JSON.stringify({ reason: 'No documented resume flow.' }) })
  assert.equal(response.status, 404)
})
