import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-fixture-cleanup-test'

const { User } = await import('../src/modules/auth/auth.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const { RecruiterPolicyAcceptance } = await import('../src/modules/recruiter-policy/recruiter-policy.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { IncidentReport } = await import('../src/modules/incidents/incident-report.model.js')
const { PlacementRestriction } = await import('../src/modules/applications/placement-restriction.model.js')
const { DemoSeedStore } = await import('../scripts/demo-seed-store.js')
const { auditTcsSmokeFixture, removeTcsSmokeFixture, TCS_SMOKE_FIXTURE_KEY } = await import('../scripts/tcs-smoke-fixture-store.js')

async function clear() { await mongoose.connection.db.dropDatabase() }
const objectId = () => new mongoose.Types.ObjectId()

test('TCS smoke fixture cleanup audits and removes only records owned by its fixture store', async t => {
  await mongoose.connect(process.env.MONGO_URI)
  t.after(async () => { await clear(); await mongoose.disconnect() })
  await clear()

  const fixtureStudent = objectId(); const fixtureCompanyUser = objectId(); const fixtureCompany = objectId(); const fixtureDrive = objectId()
  const manualStudent = objectId(); const manualCompanyUser = objectId(); const manualCompany = objectId(); const manualDrive = objectId()
  await DemoSeedStore.create({ key: TCS_SMOKE_FIXTURE_KEY, status: 'ready', studentUserIds: [fixtureStudent], companyUserIds: [fixtureCompanyUser], companyProfileIds: [fixtureCompany], pdfDirectory: 'fixture://test' })
  await User.collection.insertMany([{ _id: fixtureStudent, email: 'fixture.student@example.test' }, { _id: fixtureCompanyUser, email: 'fixture.company@example.test' }, { _id: manualStudent, email: 'manual.student@example.test' }, { _id: manualCompanyUser, email: 'manual.company@example.test' }])
  await Company.collection.insertMany([{ _id: fixtureCompany, userId: fixtureCompanyUser }, { _id: manualCompany, userId: manualCompanyUser }])
  await StudentProfile.collection.insertMany([{ userId: fixtureStudent }, { userId: manualStudent }])
  await StudentPolicyAcceptance.collection.insertMany([{ studentId: fixtureStudent }, { studentId: manualStudent }])
  await RecruiterPolicyAcceptance.collection.insertMany([{ companyId: fixtureCompanyUser }, { companyId: manualCompanyUser }])
  await PlacementDrive.collection.insertMany([{ _id: fixtureDrive, companyId: fixtureCompany }, { _id: manualDrive, companyId: manualCompany }])
  await Application.collection.insertMany([{ studentId: fixtureStudent, placementDriveId: fixtureDrive }, { studentId: manualStudent, placementDriveId: manualDrive }])
  await Notification.collection.insertMany([{ senderId: fixtureCompanyUser, recipientId: manualStudent }, { senderId: manualCompanyUser, recipientId: manualStudent, placementDriveId: manualDrive }])
  await IncidentReport.collection.insertMany([{ studentId: fixtureStudent, placementDriveId: fixtureDrive, reportedBy: fixtureCompanyUser }, { studentId: manualStudent, placementDriveId: manualDrive, reportedBy: manualCompanyUser }])
  await PlacementRestriction.collection.insertMany([{ studentId: fixtureStudent, placementDriveId: fixtureDrive }, { studentId: manualStudent, placementDriveId: manualDrive }])
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-fixture-cleanup-'))
  const manifestPath = path.join(temporaryDirectory, 'tcs-smoke-fixture-manifest.json')
  await writeFile(manifestPath, '{"fixture":"test"}\n')
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const audit = await auditTcsSmokeFixture()
  assert.equal(audit.found, true)
  assert.deepEqual(audit.records, { notifications: 1, incidents: 1, restrictions: 1, applications: 1, drives: 1, studentPolicyAcceptances: 1, recruiterPolicyAcceptances: 1, studentProfiles: 1, companies: 1, users: 2 })

  const cleaned = await removeTcsSmokeFixture({ manifestPath })
  assert.equal(cleaned.removed, true)
  await assert.rejects(() => import('node:fs/promises').then(({ access }) => access(manifestPath)))
  assert.equal(await DemoSeedStore.countDocuments({ key: TCS_SMOKE_FIXTURE_KEY }), 0)
  assert.equal(await PlacementDrive.countDocuments(), 1)
  assert.equal(await Application.countDocuments(), 1)
  assert.equal(await Notification.countDocuments(), 1)
  assert.equal(await IncidentReport.countDocuments(), 1)
  assert.equal(await PlacementRestriction.countDocuments(), 1)
  assert.equal(await User.countDocuments(), 2)
  assert.equal(await Company.countDocuments(), 1)
  assert.equal(await StudentProfile.countDocuments(), 1)
  assert.equal(await StudentPolicyAcceptance.countDocuments(), 1)
  assert.equal(await RecruiterPolicyAcceptance.countDocuments(), 1)
  assert.equal((await removeTcsSmokeFixture({ manifestPath })).removed, false)
})
