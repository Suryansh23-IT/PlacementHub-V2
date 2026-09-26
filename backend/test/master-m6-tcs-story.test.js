import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-master-regression'
process.env.JWT_SECRET = 'master-m6-tcs-story-secret-long-enough-for-isolated-tests'

const { User } = await import('../src/modules/auth/auth.model.js')
const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { StudentPlacementPolicy, StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } = await import('../src/modules/recruiter-policy/recruiter-policy.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { IncidentReport } = await import('../src/modules/incidents/incident-report.model.js')
const { PlacementRestriction } = await import('../src/modules/applications/placement-restriction.model.js')
const { createPlacementDriveDraft, submitMyPlacementDrive, reviewPlacementDriveProposal, publishPlacementDriveProposal, extendPlacementDriveApplicationDeadline, closePlacementDriveApplications, reopenPlacementDriveApplications } = await import('../src/modules/placement-drives/placement-drive.service.js')
const { getApplicationWindowStatus } = await import('../src/modules/placement-drives/placement-drive.application-window.js')
const { createPlacementDriveApplication, evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const { withdrawStudentApplication } = await import('../src/modules/applications/application-withdrawal.service.js')
const { listCompanyDriveApplicants } = await import('../src/modules/applications/company-drive-applicant.service.js')
const { listAdminPublishedDriveMonitoring } = await import('../src/modules/applications/admin-drive-monitoring.service.js')
const { sendAdminStudentNotification, sendAdminCompanyNotification, sendCompanyAdminNotification, sendCompanyDriveApplicantsNotification, listSentNotifications } = await import('../src/modules/notifications/notification.service.js')
const { createCompanyIncidentReport, reviewIncidentReport, applyRestrictionFromIncident, removeAdminPlacementRestriction, archiveIncidentReport, listActivePlacementRestrictions, listPlacementRestrictionHistory } = await import('../src/modules/incidents/incident-report.service.js')
const { consumePlacementRestrictionForDrive } = await import('../src/modules/applications/placement-restriction.service.js')

const DB = 'mongodb://127.0.0.1:27017/placementhub-v2-master-regression'
const branches = ['Information Technology', 'Computer Science and Engineering', 'Electronics and Communication Engineering', 'Electrical Engineering']
const start = new Date('2030-01-10T09:00:00.000Z')
const deadline = new Date('2030-02-10T09:00:00.000Z')
const pdf = { originalName: 'tcs-software-engineer.pdf', storagePath: '/isolated/tcs-software-engineer.pdf', mimeType: 'application/pdf', size: 128, uploadedAt: start }
const driveInput = {
  role: { title: 'Software Engineer 2027', domain: 'Software Engineering', employmentType: 'full_time', description: 'Build dependable enterprise software for TCS clients.', requiredSkills: ['Java', 'JavaScript', 'SQL', 'Git'] },
  driveDetails: { workMode: 'hybrid', workLocation: 'Bengaluru', expectedHires: 20, compensation: { amount: 700000, currency: 'INR', period: 'per_annum' }, applicationDeadline: deadline, joiningPeriod: 'July 2030' },
  eligibility: { minimumCgpa: 7, allowedBranches: branches, maximumActiveBacklogs: 0, graduationYears: [2027] },
  phases: [{ phaseNumber: 1, title: 'Online assessment', type: 'assessment', description: 'Programming and aptitude assessment.' }, { phaseNumber: 2, title: 'Technical interview', type: 'technical_interview', description: 'Technical discussion.' }],
}

const assertCode = async (promise, code) => assert.rejects(promise, error => error?.errorCode === code)
const doc = name => ({ ...pdf, originalName: `${name}.pdf` })

async function clear() { await mongoose.connection.db.dropDatabase() }
async function user(name, email, role) { return User.create({ name, email, role, passwordHash: await bcrypt.hash('12345678', 10) }) }

async function bootstrap() {
  await InstitutionProfile.create({ singletonKey: 'placementhub-v2', collegeName: 'Regression Institute', location: 'Raipur', placementEmail: 'placement@example.test', placementPhone: '9999999999', branches })
  const admin = await user('Placement Admin', 'admin@master.test', USER_ROLES.PLACEMENT_ADMIN)
  const companyUser = await user('TCS Recruitment', 'tcs@master.test', USER_ROLES.COMPANY)
  const outsider = await user('Unapproved Recruiter', 'outsider@master.test', USER_ROLES.COMPANY)
  const company = await Company.create({ userId: companyUser._id, companyName: 'TCS', industry: 'IT Services', location: 'Bengaluru', officialEmail: 'campus@tcs.test', recruiterName: 'TCS Campus Team', approvalStatus: 'approved' })
  await Company.create({ userId: outsider._id, companyName: 'Unapproved Co', approvalStatus: 'pending' })
  const studentPolicy = await StudentPlacementPolicy.create({ title: 'Student Placement Policy', academicYear: '2030-31', version: '1.0', policyText: 'Placement participation policy.', active: true })
  const recruiterPolicy = await RecruiterPlacementPolicy.create({ title: 'Recruiter Placement Policy', academicYear: '2030-31', version: '1.0', policyText: 'Recruiter participation policy.', active: true })
  await RecruiterPolicyAcceptance.create({ companyId: companyUser._id, policyId: recruiterPolicy._id, policyVersion: recruiterPolicy.version, acceptedAt: start })
  const definitions = [
    ...branches.flatMap((branch, branchIndex) => Array.from({ length: 4 }, (_, index) => ({ key: `S${branchIndex * 4 + index + 1}`, branch, cgpa: 8.1 + index / 10, backlogs: 0, verified: true, accepted: true }))),
    { key: 'lowCgpa', branch: branches[0], cgpa: 6.2, backlogs: 0, verified: true, accepted: true },
    { key: 'backlog', branch: branches[0], cgpa: 7.6, backlogs: 1, verified: true, accepted: true },
    { key: 'noPolicy', branch: branches[1], cgpa: 7.8, backlogs: 0, verified: true, accepted: false },
    { key: 'wrongYear', branch: branches[1], cgpa: 7.8, backlogs: 0, verified: true, accepted: true, year: 2028 },
    { key: 'unverified', branch: branches[2], cgpa: 8.1, backlogs: 0, verified: false, accepted: false },
    { key: 'lowCgpaTwo', branch: branches[2], cgpa: 6.5, backlogs: 0, verified: true, accepted: true },
    { key: 'backlogTwo', branch: branches[3], cgpa: 7.4, backlogs: 2, verified: true, accepted: true },
    { key: 'noPolicyTwo', branch: branches[3], cgpa: 7.7, backlogs: 0, verified: true, accepted: false },
  ]
  const students = {}
  for (const [index, definition] of definitions.entries()) {
    const value = await user(`Master ${definition.key}`, `${definition.key.toLowerCase()}@master.test`, USER_ROLES.STUDENT)
    students[definition.key] = value
    await StudentProfile.create({ userId: value._id, branch: definition.branch, graduationYear: definition.year ?? 2027, cgpa: definition.cgpa, activeBacklogs: definition.backlogs, verificationStatus: definition.verified ? 'verified' : 'pending', rollNumber: `M2030${String(index + 1).padStart(3, '0')}`, phone: `900000${String(index).padStart(4, '0')}`, skills: ['Java', 'SQL', 'Git'], projects: [{ title: `Project ${definition.key}`, description: 'A realistic placement regression fixture project.', technologies: ['Java', 'SQL'] }], resume: doc(`${definition.key}-resume`), collegeResult: doc(`${definition.key}-result`), class10: { score: 85, marksheet: doc(`${definition.key}-10`) }, class12: { score: 82, marksheet: doc(`${definition.key}-12`) } })
    if (definition.accepted) await StudentPolicyAcceptance.create({ studentId: value._id, policyId: studentPolicy._id, policyVersion: studentPolicy.version, acceptedAt: start })
  }
  return { admin, companyUser, outsider, company, students }
}

test('master-m6-tcs-story', async t => {
  await mongoose.connect(DB)
  await clear()
  t.after(async () => { await clear(); await mongoose.disconnect() })
  const { admin, companyUser, outsider, company, students } = await bootstrap()
  let drive
  await t.test('M5 proposal, review, publication, and immutable ownership', async () => {
    await assertCode(createPlacementDriveDraft(outsider._id, driveInput), 'FORBIDDEN')
    drive = await createPlacementDriveDraft(companyUser._id, driveInput)
    await PlacementDrive.updateOne({ _id: drive._id }, { $set: { 'documents.companyRecruitmentInformation': doc('tcs-recruitment'), 'documents.placementDriveJobDescription': doc('tcs-jd') } })
    await submitMyPlacementDrive(companyUser._id, drive._id)
    const approved = await reviewPlacementDriveProposal(drive._id, admin._id, { decision: 'approved' })
    assert.equal(approved.proposalStatus, 'approved'); assert.equal(approved.lifecycleStatus, 'unpublished')
    assert.equal((await createPlacementDriveApplication(students.S1._id, drive._id, { now: start })).eligible, false)
    const published = await publishPlacementDriveProposal(drive._id, admin._id, { now: start })
    assert.equal(published.drive.lifecycleStatus, 'published'); assert.equal(published.notificationsCreated, 16)
    drive = published.drive
    const publishNotifications = await Notification.find({ placementDriveId: drive._id, type: 'placement_drive_published' })
    assert.equal(publishNotifications.length, 16)
    assert.equal(await Application.countDocuments({ placementDriveId: drive._id }), 0)
  })
  await t.test('eligibility, batching, applications, and communication', async () => {
    const eligibility = await Promise.all(Object.values(students).map(async student => [String(student._id), await evaluatePlacementDriveEligibility(student._id, drive._id, { now: start })]))
    assert.equal(eligibility.filter(([, result]) => result.eligible).length, 16)
    assert.equal(eligibility.filter(([, result]) => !result.eligible).length, 8)
    assert.ok(eligibility.find(([id]) => id === String(students.lowCgpa._id))[1].reasons.some(reason => reason.code === 'minimum_cgpa_not_met'))
    assert.ok(eligibility.find(([id]) => id === String(students.backlog._id))[1].reasons.some(reason => reason.code === 'too_many_active_backlogs'))
    assert.ok(eligibility.find(([id]) => id === String(students.noPolicy._id))[1].reasons.some(reason => reason.code === 'student_policy_not_accepted'))
    assert.ok(eligibility.find(([id]) => id === String(students.unverified._id))[1].reasons.some(reason => reason.code === 'student_not_verified'))
    assert.ok(eligibility.find(([id]) => id === String(students.wrongYear._id))[1].reasons.some(reason => reason.code === 'graduation_year_not_eligible'))
    const manual = await sendAdminStudentNotification(admin._id, { audience: 'eligible_drive', placementDriveId: drive._id, title: 'TCS update', message: 'Review the TCS Software Engineer Drive.' })
    assert.equal(manual.notificationsCreated, 16)
    const batch = await Notification.findOne({ title: 'TCS update' }); assert.ok(batch.notificationBatchId)
    assert.equal(await Notification.countDocuments({ notificationBatchId: batch.notificationBatchId }), 16)
    await Notification.updateMany({ notificationBatchId: batch.notificationBatchId }, { $set: { isRead: false } })
    await Notification.updateMany({ notificationBatchId: batch.notificationBatchId, recipientId: { $in: [students.S1._id, students.S2._id] } }, { $set: { isRead: true } })
    const history = await listSentNotifications(admin._id)
    const grouped = history.find(item => item.notificationBatchId === batch.notificationBatchId)
    assert.deepEqual([grouped.recipientCount, grouped.readCount, grouped.unreadCount], [16, 2, 14])
    await sendAdminCompanyNotification(admin._id, companyUser._id, { title: 'TCS review', message: 'Drive context is attached.', placementDriveId: drive._id })
    await sendCompanyAdminNotification(companyUser._id, { title: 'TCS acknowledgement', message: 'TCS confirms the drive.', placementDriveId: drive._id })
    const initialApplicants = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15']
    for (const key of initialApplicants) { const applied = await createPlacementDriveApplication(students[key]._id, drive._id, { now: start }); assert.equal(applied.application.currentPhase, 0) }
    await assertCode(createPlacementDriveApplication(students.S1._id, drive._id, { now: start }), 'CONFLICT')
    for (const key of ['lowCgpa', 'backlog', 'noPolicy', 'wrongYear', 'unverified', 'lowCgpaTwo', 'backlogTwo', 'noPolicyTwo']) { const result = await createPlacementDriveApplication(students[key]._id, drive._id, { now: start }); assert.equal(result.application, null) }
    assert.equal(await Application.countDocuments({ placementDriveId: drive._id }), 13)
    const companyApplicants = await listCompanyDriveApplicants(companyUser._id, drive._id)
    assert.equal(companyApplicants.applicants.length, 13)
  })
  await t.test('withdrawal, incidents, discipline escalation, and restoration', async () => {
    const app = await Application.findOne({ studentId: students.S3._id, placementDriveId: drive._id })
    await withdrawStudentApplication(students.S3._id, app._id, { now: new Date('2030-01-15T09:00:00.000Z') })
    const withdrawn = await Application.findById(app._id); assert.equal(withdrawn.currentStatus, 'withdrawn'); assert.equal(withdrawn.phaseHistory.length, 2)
    const applicants = await listCompanyDriveApplicants(companyUser._id, drive._id); assert.deepEqual([applicants.applicants.length, applicants.exited.length], [12, 1])
    await sendAdminStudentNotification(admin._id, { audience: 'drive_applicants', placementDriveId: drive._id, title: 'TCS active pool', message: 'Active Phase 0 applicants update.' })
    await sendCompanyDriveApplicantsNotification(companyUser._id, { placementDriveId: drive._id, title: 'TCS assessment', message: 'Assessment information for active candidates.' })
    const report = await createCompanyIncidentReport(companyUser._id, { applicationId: app._id, category: 'withdrawal', description: 'Candidate withdrew after confirming attendance.' })
    await assertCode(createCompanyIncidentReport(companyUser._id, { applicationId: app._id, category: 'withdrawal', description: 'Duplicate pending report.' }), 'CONFLICT')
    await reviewIncidentReport(admin._id, report._id, { action: 'warning_only', reviewNote: 'Follow the placement commitment process.' })
    const warning = await IncidentReport.findById(report._id); assert.deepEqual([warning.reviewStatus, warning.decision], ['closed', 'warning_only'])
    const temporary = await applyRestrictionFromIncident(admin._id, report._id, { type: 'temporary_drive_count', driveCount: 5, reason: 'Repeated withdrawal concern.' })
    assert.equal(temporary.status, 'active')
    const permanent = await applyRestrictionFromIncident(admin._id, report._id, { type: 'permanent', reason: 'Escalated after review.' })
    assert.equal(permanent.type, 'permanent')
    const superseded = await PlacementRestriction.findById(temporary._id); assert.equal(superseded.inactiveReason, 'superseded')
    await removeAdminPlacementRestriction(admin._id, permanent._id, 'Administrative restoration approved.')
    assert.equal((await PlacementRestriction.findById(permanent._id)).status, 'inactive')
    assert.equal((await Notification.countDocuments({ type: 'restriction_removed', recipientId: students.S3._id })), 1)
    assert.equal((await evaluatePlacementDriveEligibility(students.S3._id, drive._id, { now: start })).eligible, true)
    await archiveIncidentReport(admin._id, report._id)
    assert.ok((await IncidentReport.findById(report._id)).archivedAt)
  })
  await t.test('deadline management, expiry, and monitoring consistency', async () => {
    const publishedAt = new Date(drive.publishedAt)
    const extended = new Date('2030-03-01T00:00:00.000Z')
    await extendPlacementDriveApplicationDeadline(drive._id, admin._id, { applicationDeadline: extended }, { now: new Date('2030-01-20T00:00:00.000Z') })
    assert.equal((await PlacementDrive.findById(drive._id)).publishedAt.getTime(), publishedAt.getTime())
    await closePlacementDriveApplications(drive._id, admin._id, { now: new Date('2030-01-21T00:00:00.000Z') })
    let blocked = await createPlacementDriveApplication(students.S7._id, drive._id, { now: new Date('2030-01-21T00:00:00.000Z') })
    assert.ok(blocked.reasons.some(reason => reason.code === 'applications_manually_closed'))
    await reopenPlacementDriveApplications(drive._id, admin._id, {}, { now: new Date('2030-01-22T00:00:00.000Z') })
    assert.ok((await createPlacementDriveApplication(students.S7._id, drive._id, { now: new Date('2030-01-22T00:00:00.000Z') })).application)
    await closePlacementDriveApplications(drive._id, admin._id, { now: new Date('2030-01-23T00:00:00.000Z') })
    blocked = await createPlacementDriveApplication(students.S8._id, drive._id, { now: new Date('2030-01-23T00:00:00.000Z') })
    assert.ok(blocked.reasons.some(reason => reason.code === 'applications_manually_closed'))
    await assertCode(reopenPlacementDriveApplications(drive._id, admin._id, {}, { now: new Date('2030-03-02T00:00:00.000Z') }), 'VALIDATION_ERROR')
    const reopenedDeadline = new Date('2030-04-01T00:00:00.000Z')
    await reopenPlacementDriveApplications(drive._id, admin._id, { applicationDeadline: reopenedDeadline }, { now: new Date('2030-03-02T00:00:00.000Z') })
    assert.ok((await createPlacementDriveApplication(students.S8._id, drive._id, { now: new Date('2030-03-03T00:00:00.000Z') })).application)
    const expired = await createPlacementDriveApplication(students.S16._id, drive._id, { now: new Date('2030-04-02T00:00:00.000Z') })
    assert.ok(expired.reasons.some(reason => reason.code === 'application_deadline_passed'))
    const monitoring = await listAdminPublishedDriveMonitoring()
    const row = monitoring.find(item => String(item._id) === String(drive._id))
    assert.deepEqual([row.applicationCount, row.activeApplicantCount, row.exitedApplicantCount], [15, 14, 1])
    assert.equal(getApplicationWindowStatus(await PlacementDrive.findById(drive._id), new Date('2030-04-02T00:00:00.000Z')).reason, 'deadline_passed')
  })
  await t.test('temporary restriction counter and preserved history', async () => {
    const source = await IncidentReport.create({ studentId: students.S4._id, applicationId: (await Application.findOne({ studentId: students.S4._id }))._id, placementDriveId: drive._id, companyId: company._id, phase: 0, applicationStatus: 'applied', category: 'misconduct', description: 'Separate counter fixture.', reportedBy: companyUser._id })
    const restriction = await applyRestrictionFromIncident(admin._id, source._id, { type: 'temporary_drive_count', driveCount: 5, reason: 'Five future drives.' })
    const oldDrive = await PlacementDrive.create({ ...driveInput, companyId: company._id, proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: new Date('2025-01-01'), documents: { companyRecruitmentInformation: doc('old-a'), placementDriveJobDescription: doc('old-b') } })
    await consumePlacementRestrictionForDrive(students.S4._id, oldDrive._id)
    assert.equal((await PlacementRestriction.findById(restriction._id)).remainingDriveCount, 5)
    for (let index = 1; index <= 5; index += 1) {
      const aux = await PlacementDrive.create({ ...driveInput, role: { ...driveInput.role, title: `TCS auxiliary ${index}` }, companyId: company._id, proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: new Date(`2030-0${index}-15T00:00:00.000Z`), documents: { companyRecruitmentInformation: doc(`aux-${index}-a`), placementDriveJobDescription: doc(`aux-${index}-b`) } })
      await consumePlacementRestrictionForDrive(students.S4._id, aux._id)
      assert.equal((await PlacementRestriction.findById(restriction._id)).remainingDriveCount, 5 - index)
    }
    assert.equal((await PlacementRestriction.findById(restriction._id)).status, 'inactive')
    assert.equal(await Notification.countDocuments({ type: 'temporary_restriction_completed', recipientId: students.S4._id }), 1)
    assert.ok((await listPlacementRestrictionHistory()).length >= 3)
    assert.equal((await listActivePlacementRestrictions()).length, 0)
  })
})
