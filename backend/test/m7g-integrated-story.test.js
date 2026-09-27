import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-m7g-integrated'
process.env.JWT_SECRET = 'm7g-integrated-story-secret-long-enough-for-tests'

const { User } = await import('../src/modules/auth/auth.model.js')
const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { StudentPlacementPolicy, StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { createPlacementDriveApplication } = await import('../src/modules/applications/application.service.js')
const { getStudentCurrentPhaseExecution, getStudentRecruitmentJourney } = await import('../src/modules/applications/student-placement-drive.service.js')
const { executeCompanyRecruitmentTransition } = await import('../src/modules/recruitment/recruitment-transition.service.js')
const { getCompanyRecruitmentWorkspace, updateCompanyPhaseExecution } = await import('../src/modules/recruitment/recruitment-workspace.service.js')
const { sendCompanyPhaseCandidatesNotification } = await import('../src/modules/notifications/notification.service.js')
const { submitPlacementReport, confirmPlacementRecord, decidePlacementRecord } = await import('../src/modules/placements/placement-record.service.js')
const { getAdminPublishedDriveMonitoring } = await import('../src/modules/applications/admin-drive-monitoring.service.js')

const DB = 'mongodb://127.0.0.1:27017/placementhub-v2-m7g-integrated'
const branches = ['Computer Science and Engineering']
const future = new Date('2035-02-01T00:00:00.000Z')
const doc = name => ({ originalName: `${name}.pdf`, storagePath: `/m7g-private/${name}.pdf`, mimeType: 'application/pdf', size: 128, uploadedAt: new Date('2035-01-01T00:00:00.000Z') })

async function user(name, email, role) { return User.create({ name, email, role, passwordHash: await bcrypt.hash('12345678', 4) }) }
async function clear() { await mongoose.connection.db.dropDatabase() }
async function drive(companyId, title, phases = 2) {
  return PlacementDrive.create({
    companyId,
    proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: new Date('2035-01-01T00:00:00.000Z'),
    role: { title, domain: 'Engineering', employmentType: 'full_time', description: 'M7G integrated regression role.', requiredSkills: ['JavaScript'] },
    driveDetails: { workMode: 'online', workLocation: 'Raipur', expectedHires: 2, compensation: { amount: 800000, currency: 'INR', period: 'per_annum' }, applicationDeadline: future, joiningPeriod: 'July 2035' },
    eligibility: { minimumCgpa: 7, allowedBranches: branches, maximumActiveBacklogs: 0, graduationYears: [2027] },
    phases: Array.from({ length: phases }, (_, index) => ({ phaseNumber: index + 1, title: `Stage ${index + 1}`, type: index === 0 ? 'assessment' : 'technical_interview', description: `Configured stage ${index + 1}.` })),
    documents: { companyRecruitmentInformation: doc(`${title}-company`), placementDriveJobDescription: doc(`${title}-jd`) },
  })
}

test('M7G integrated Company → Student → Admin recruitment story', async t => {
  await mongoose.connect(DB); await clear()
  t.after(async () => { await clear(); await mongoose.disconnect() })

  await InstitutionProfile.create({ singletonKey: 'placementhub-v2', collegeName: 'M7G Institute', location: 'Raipur', placementEmail: 'placement@m7g.test', placementPhone: '9999999999', branches })
  const admin = await user('M7G Admin', 'admin@m7g.test', USER_ROLES.PLACEMENT_ADMIN)
  const microsoftUser = await user('Microsoft Recruiter', 'microsoft@m7g.test', USER_ROLES.COMPANY)
  const tcsUser = await user('TCS Recruiter', 'tcs@m7g.test', USER_ROLES.COMPANY)
  const microsoft = await Company.create({ userId: microsoftUser._id, companyName: 'Microsoft', industry: 'Technology', location: 'Bengaluru', officialEmail: 'campus@microsoft.test', recruiterName: 'Microsoft Campus', approvalStatus: 'approved' })
  const tcs = await Company.create({ userId: tcsUser._id, companyName: 'TCS', industry: 'Technology', location: 'Raipur', officialEmail: 'campus@tcs.test', recruiterName: 'TCS Campus', approvalStatus: 'approved' })
  const policy = await StudentPlacementPolicy.create({ title: 'M7G Policy', academicYear: '2035-36', version: '1.0', policyText: 'Integrated story policy.', active: true })
  const student = await user('Asha Student', 'asha@m7g.test', USER_ROLES.STUDENT)
  const internshipStudent = await user('Ira Intern', 'ira@m7g.test', USER_ROLES.STUDENT)
  for (const [index, account] of [student, internshipStudent].entries()) {
    await StudentProfile.create({ userId: account._id, branch: branches[0], graduationYear: 2027, cgpa: 8.5, activeBacklogs: 0, verificationStatus: 'verified', rollNumber: `M7G${index + 1}`, phone: `900000000${index}`, skills: ['JavaScript'], projects: [{ title: 'M7G project', description: 'Integrated test project.', technologies: ['JavaScript'] }], resume: doc(`resume-${index}`), collegeResult: doc(`result-${index}`) })
    await StudentPolicyAcceptance.create({ studentId: account._id, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date('2035-01-01T00:00:00.000Z') })
  }
  const microsoftDrive = await drive(microsoft._id, 'Microsoft Engineer', 2)
  const tcsDrive = await drive(tcs._id, 'TCS Engineer', 1)
  const infosysDrive = await drive(tcs._id, 'Infosys Engineer', 1)
  const futureDrive = await drive(tcs._id, 'Future Engineer', 1)
  const internshipDrive = await drive(microsoft._id, 'Microsoft Internship', 1)

  const [sourceApply, tcsApply, infosysApply] = await Promise.all([microsoftDrive, tcsDrive, infosysDrive].map(item => createPlacementDriveApplication(student._id, item._id, { now: new Date('2035-01-05T00:00:00.000Z') })))
  assert.deepEqual([sourceApply.application.currentPhase, tcsApply.application.currentPhase, infosysApply.application.currentPhase], [0, 0, 0])

  const blueprintBefore = microsoftDrive.phases.map(phase => phase.toObject())
  await updateCompanyPhaseExecution(microsoftUser._id, microsoftDrive._id, 1, { status: 'scheduled', mode: 'online', scheduledAt: new Date('2035-01-10T09:00:00.000Z'), instructions: 'Complete the assessment.', resources: [{ type: 'test_link', label: 'Assessment', url: 'https://example.test/assessment' }], instructionPdf: doc('phase-one') })
  assert.deepEqual((await PlacementDrive.findById(microsoftDrive._id)).phases.map(phase => phase.toObject()), blueprintBefore)

  let source = await Application.findById(sourceApply.application._id)
  source = await executeCompanyRecruitmentTransition(microsoftUser._id, microsoftDrive._id, source._id, { action: 'advance', targetPhase: 1 })
  const phaseMessage = await sendCompanyPhaseCandidatesNotification(microsoftUser._id, { placementDriveId: microsoftDrive._id, phaseNumber: 1, title: 'Assessment details', message: 'Use the configured link.', requestId: '6bb03808-10c3-4828-a503-2117035f1270' })
  assert.deepEqual([phaseMessage.recipientCount, phaseMessage.notificationsCreated], [1, 1])
  assert.equal(await Notification.countDocuments({ recipientId: student._id, phaseNumber: 1, type: 'company_to_phase_candidates' }), 1)

  const current = await getStudentCurrentPhaseExecution(student._id, source._id)
  assert.equal(current.execution.resources[0].url, 'https://example.test/assessment')
  assert.equal(JSON.stringify(current).includes('/m7g-private/phase-one.pdf'), false)
  await assert.rejects(getStudentCurrentPhaseExecution(internshipStudent._id, source._id), error => error.errorCode === 'NOT_FOUND')

  source = await executeCompanyRecruitmentTransition(microsoftUser._id, microsoftDrive._id, source._id, { action: 'advance', targetPhase: 2 })
  source = await executeCompanyRecruitmentTransition(microsoftUser._id, microsoftDrive._id, source._id, { action: 'provisionally_select' })
  const report = await submitPlacementReport(student._id, source._id, { outcomeType: 'full_time', location: 'Bengaluru', joiningPeriod: 'July 2035' })
  const pendingJourney = await getStudentRecruitmentJourney(student._id, source._id, { placementRecordModel: PlacementRecord })
  assert.equal(pendingJourney.placementReportState, 'pending_admin_verification')

  const confirmation = await confirmPlacementRecord(admin._id, report._id, {})
  assert.deepEqual([confirmation.record.verificationState, (await Application.findById(source._id)).currentStatus, confirmation.closedApplications], ['confirmed', 'placement_confirmed', 2])
  assert.deepEqual((await Application.find({ studentId: student._id, placementDriveId: { $in: [tcsDrive._id, infosysDrive._id] } })).map(item => item.currentStatus).sort(), ['closed_placed_elsewhere', 'closed_placed_elsewhere'])
  assert.equal(await Notification.countDocuments({ recipientId: student._id, type: 'application_closed_placed_elsewhere' }), 2)
  const locked = await createPlacementDriveApplication(student._id, futureDrive._id, { enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.equal(locked.application, null)
  assert.ok(locked.reasons.some(reason => reason.code === 'placement_confirmed_elsewhere'))

  const adminMonitoring = await getAdminPublishedDriveMonitoring(microsoftDrive._id, { placementRecordModel: PlacementRecord })
  const companyMonitoring = await getCompanyRecruitmentWorkspace(microsoftUser._id, microsoftDrive._id, { placementRecordModel: PlacementRecord })
  assert.deepEqual([adminMonitoring.funnel.confirmedPlacements, companyMonitoring.funnel.placementConfirmed], [1, 1])
  await assert.rejects(getCompanyRecruitmentWorkspace(tcsUser._id, microsoftDrive._id, { placementRecordModel: PlacementRecord }), error => error.errorCode === 'NOT_FOUND')

  await decidePlacementRecord(admin._id, report._id, 'revoke', 'Offer withdrawn by Placement Cell.')
  const restored = await createPlacementDriveApplication(student._id, futureDrive._id, { enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.ok(restored.application)
  assert.equal((await Application.findById(tcsApply.application._id)).currentStatus, 'closed_placed_elsewhere')
  assert.equal((await PlacementRecord.findById(report._id)).history.at(-1).event, 'admin_revoked')

  const internshipApply = await createPlacementDriveApplication(internshipStudent._id, internshipDrive._id)
  let internshipApplication = await executeCompanyRecruitmentTransition(microsoftUser._id, internshipDrive._id, internshipApply.application._id, { action: 'advance', targetPhase: 1 })
  internshipApplication = await executeCompanyRecruitmentTransition(microsoftUser._id, internshipDrive._id, internshipApplication._id, { action: 'provisionally_select' })
  const internshipReport = await submitPlacementReport(internshipStudent._id, internshipApplication._id, { outcomeType: 'internship', location: 'Raipur' })
  await confirmPlacementRecord(admin._id, internshipReport._id, {})
  const internshipFuture = await createPlacementDriveApplication(internshipStudent._id, futureDrive._id, { enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.ok(internshipFuture.application)
})
