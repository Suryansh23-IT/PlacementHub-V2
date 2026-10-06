import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'
import mongoose from 'mongoose'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-m7-perfection'
process.env.JWT_SECRET = 'm7-perfection-secret-long-enough-for-tests'

const { User } = await import('../src/modules/auth/auth.model.js')
const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { StudentPlacementPolicy, StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } = await import('../src/modules/recruiter-policy/recruiter-policy.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { IncidentReport } = await import('../src/modules/incidents/incident-report.model.js')
const { PlacementRestriction } = await import('../src/modules/applications/placement-restriction.model.js')
const { cancelPlacementDrive, createPlacementDriveDraft, submitMyPlacementDrive, reviewPlacementDriveProposal, publishPlacementDriveProposal, extendPlacementDriveApplicationDeadline, closePlacementDriveApplications, postponePlacementDrive, reopenPlacementDriveApplications } = await import('../src/modules/placement-drives/placement-drive.service.js')
const { evaluatePlacementDriveEligibility, createPlacementDriveApplication } = await import('../src/modules/applications/application.service.js')
const { withdrawStudentApplication } = await import('../src/modules/applications/application-withdrawal.service.js')
const { executeCompanyRecruitmentTransition } = await import('../src/modules/recruitment/recruitment-transition.service.js')
const { getCompanyRecruitmentWorkspace, getCompanyPhaseCandidateRecipientCount, listCompanyRecruitmentActivity, updateCompanyPhaseExecution } = await import('../src/modules/recruitment/recruitment-workspace.service.js')
const { exportCompanyRecruitmentCandidates } = await import('../src/modules/recruitment/recruitment-export.service.js')
const { getStudentCurrentPhaseExecution, getStudentRecruitmentJourney } = await import('../src/modules/applications/student-placement-drive.service.js')
const { sendCompanyPhaseCandidatesNotification, listSentNotifications } = await import('../src/modules/notifications/notification.service.js')
const { submitPlacementReport, savePlacementProof, getPlacementProof, confirmPlacementRecord, decidePlacementRecord, invalidateUnselectedPlacementReport, notifyProvisionalSelection } = await import('../src/modules/placements/placement-record.service.js')
const { getAdminPublishedDriveMonitoring } = await import('../src/modules/applications/admin-drive-monitoring.service.js')
const { createCompanyIncidentReport } = await import('../src/modules/incidents/incident-report.service.js')
const { phaseExecutionUpdateSchema } = await import('../src/modules/recruitment/recruitment-workspace.validation.js')

const DB = 'mongodb://127.0.0.1:27017/placementhub-v2-m7-perfection'
const NOW = new Date('2035-01-10T00:00:00.000Z')
const DEADLINE = new Date('2035-02-10T00:00:00.000Z')
const BRANCHES = ['Information Technology', 'Computer Science and Engineering', 'Electronics and Communication Engineering', 'Electrical Engineering', 'Mechanical Engineering']
const allowedBranches = BRANCHES.slice(0, 4)
const validationCompanyName = process.env.M7_PERFECTION_COMPANY_NAME || 'Microsoft'
const validationRoleTitle = process.env.M7_PERFECTION_ROLE_TITLE || 'Software Engineer'
const validationCtc = Number(process.env.M7_PERFECTION_CTC || 1800000)
const pdf = name => ({ originalName: `${name}.pdf`, storagePath: `/private/m7-perfect/${name}.pdf`, mimeType: 'application/pdf', size: 128, uploadedAt: NOW })

async function account(name, email, role) { return User.create({ name, email, role, passwordHash: await bcrypt.hash('M7-Perfect-123!', 4) }) }
async function expectCode(promise, errorCode) { await assert.rejects(promise, error => error.errorCode === errorCode) }
async function publishedDrive(companyId, title, phases = 1) {
  return PlacementDrive.create({
    companyId, proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: NOW,
    role: { title, domain: 'Engineering', employmentType: 'full_time', description: `${title} recruitment.`, requiredSkills: ['JavaScript'] },
    driveDetails: { workMode: 'hybrid', workLocation: 'Bengaluru', expectedHires: 10, compensation: { amount: 1200000, currency: 'INR', period: 'per_annum' }, applicationDeadline: DEADLINE, joiningPeriod: 'July 2035' },
    eligibility: { minimumCgpa: 7.5, allowedBranches, maximumActiveBacklogs: 0, graduationYears: [2027] },
    phases: Array.from({ length: phases }, (_, index) => ({ phaseNumber: index + 1, title: `Phase ${index + 1}`, type: index === 0 ? 'assessment' : 'technical_interview', description: `Configured phase ${index + 1}.` })),
    documents: { companyRecruitmentInformation: pdf(`${title}-company`), placementDriveJobDescription: pdf(`${title}-jd`) },
  })
}

test('final M7 perfection story executes one realistic five-phase Company Drive end to end', async t => {
  await mongoose.connect(DB)
  await mongoose.connection.db.dropDatabase()
  const temp = await mkdtemp(path.join(tmpdir(), 'm7-perfect-'))
  t.after(async () => {
    await rm(temp, { recursive: true, force: true })
    if (process.env.M7_PERFECTION_KEEP_UI !== '1') await mongoose.connection.db.dropDatabase()
    await mongoose.disconnect()
  })

  await InstitutionProfile.create({ singletonKey: 'placementhub-v2', collegeName: 'PlacementHub Final College', location: 'Raipur', placementEmail: 'placement@perfect.test', placementPhone: '9999999999', branches: BRANCHES })
  const admin = await account('Placement Admin', 'admin@perfect.test', USER_ROLES.PLACEMENT_ADMIN)
  const microsoftUser = await account('Microsoft Recruiter', 'microsoft@perfect.test', USER_ROLES.COMPANY)
  const tcsUser = await account('TCS Recruiter', 'tcs@perfect.test', USER_ROLES.COMPANY)
  const unapprovedUser = await account('Pending Recruiter', 'pending@perfect.test', USER_ROLES.COMPANY)
  const microsoft = await Company.create({ userId: microsoftUser._id, companyName: validationCompanyName, industry: 'Technology', location: 'Bengaluru', officialEmail: 'campus@microsoft.test', recruiterName: `${validationCompanyName} Campus`, approvalStatus: 'approved', participationLetter: pdf('microsoft-participation') })
  const tcs = await Company.create({ userId: tcsUser._id, companyName: 'TCS', industry: 'Technology', location: 'Pune', officialEmail: 'campus@tcs.test', recruiterName: 'TCS Campus', approvalStatus: 'approved', participationLetter: pdf('tcs-participation') })
  await Company.create({ userId: unapprovedUser._id, companyName: 'Pending Co', approvalStatus: 'pending' })
  assert.equal((await Company.findById(microsoft._id)).participationLetter.originalName, 'microsoft-participation.pdf')

  const studentPolicy = await StudentPlacementPolicy.create({ title: 'Student Placement Policy', academicYear: '2034-35', version: '7.0', policyText: 'Final M7 policy.', active: true })
  const recruiterPolicy = await RecruiterPlacementPolicy.create({ title: 'Recruiter Placement Policy', academicYear: '2034-35', version: '7.0', policyText: 'Final M7 recruiter policy.', active: true })
  await RecruiterPolicyAcceptance.create({ companyId: microsoftUser._id, policyId: recruiterPolicy._id, policyVersion: recruiterPolicy.version, acceptedAt: NOW })

  const students = {}
  const variants = {
    S06: { cgpa: 7.1 }, S07: { activeBacklogs: 1 }, S08: { branch: BRANCHES[4] }, S09: { graduationYear: 2028 }, S10: { verificationStatus: 'pending' },
  }
  for (let number = 1; number <= 20; number += 1) {
    const key = `S${String(number).padStart(2, '0')}`
    const user = await account(key === 'S19' ? 'Suyash Ghilahare' : `Student ${key}`, `${key.toLowerCase()}@perfect.test`, USER_ROLES.STUDENT)
    students[key] = user
    const override = variants[key] ?? {}
    await StudentProfile.create({ userId: user._id, branch: override.branch ?? allowedBranches[(number - 1) % 3], graduationYear: override.graduationYear ?? 2027, cgpa: override.cgpa ?? 8.4, activeBacklogs: override.activeBacklogs ?? 0, verificationStatus: override.verificationStatus ?? 'verified', rollNumber: `M7${String(number).padStart(3, '0')}`, phone: `90000000${String(number).padStart(2, '0')}`, skills: ['JavaScript'], projects: [{ title: 'Placement project', description: 'Verified profile fixture.', technologies: ['JavaScript'] }], resume: pdf(`${key}-resume`), collegeResult: pdf(`${key}-result`) })
    if (key !== 'S11') await StudentPolicyAcceptance.create({ studentId: user._id, policyId: studentPolicy._id, policyVersion: studentPolicy.version, acceptedAt: NOW })
  }

  const proposal = {
    role: { title: validationRoleTitle, domain: 'Engineering', employmentType: 'full_time', description: `${validationCompanyName} campus Software Engineer role.`, requiredSkills: ['JavaScript', 'Data Structures'] },
    driveDetails: { workMode: 'hybrid', workLocation: 'Bengaluru', expectedHires: 8, compensation: { amount: validationCtc, currency: 'INR', period: 'per_annum' }, applicationDeadline: DEADLINE, joiningPeriod: 'July 2035' },
    eligibility: { minimumCgpa: 7.5, allowedBranches, maximumActiveBacklogs: 0, graduationYears: [2027] },
    phases: [
      { phaseNumber: 1, title: 'Resume / Screening Round', type: 'other', description: 'Resume screening.' },
      { phaseNumber: 2, title: 'Online Assessment', type: 'assessment', description: 'Online coding assessment.' },
      { phaseNumber: 3, title: 'Technical Interview 1', type: 'technical_interview', description: 'First technical interview.' },
      { phaseNumber: 4, title: 'Technical Interview 2', type: 'technical_interview', description: 'Second technical interview.' },
      { phaseNumber: 5, title: 'HR Interview', type: 'hr_interview', description: 'Final HR discussion.' },
    ],
    documents: { companyRecruitmentInformation: pdf('microsoft-recruitment'), placementDriveJobDescription: pdf('microsoft-software-engineer-jd') },
  }
  let drive = await createPlacementDriveDraft(microsoftUser._id, proposal)
  await expectCode(createPlacementDriveDraft(unapprovedUser._id, proposal), 'FORBIDDEN')
  await submitMyPlacementDrive(microsoftUser._id, drive._id)
  await reviewPlacementDriveProposal(drive._id, admin._id, { decision: 'approved' })
  const publication = await publishPlacementDriveProposal(drive._id, admin._id, { now: NOW })
  drive = publication.drive
  assert.equal(publication.notificationsCreated, 14)
  assert.ok(drive.publishedAt)
  assert.match(`DRV-${String(drive._id).slice(-8).toUpperCase()}`, /^DRV-[A-F\d]{8}$/)
  assert.deepEqual(drive.phases.map(item => item.phaseNumber), [1, 2, 3, 4, 5])
  assert.equal(drive.phases.some(item => item.phaseNumber === 0), false)
  assert.equal((await publishPlacementDriveProposal(drive._id, admin._id, { now: NOW })).notificationsCreated, 0)
  assert.equal(await Notification.countDocuments({ placementDriveId: drive._id, type: 'placement_drive_published' }), 14)

  const expectedEligibility = { S06: 'minimum_cgpa_not_met', S07: 'too_many_active_backlogs', S08: 'branch_not_eligible', S09: 'graduation_year_not_eligible', S10: 'student_not_verified', S11: 'student_policy_not_accepted' }
  assert.equal((await evaluatePlacementDriveEligibility(students.S01._id, drive._id, { now: NOW })).eligible, true)
  for (const [key, code] of Object.entries(expectedEligibility)) {
    const result = await evaluatePlacementDriveEligibility(students[key]._id, drive._id, { now: NOW })
    assert.equal(result.eligible, false)
    assert.ok(result.reasons.some(reason => reason.code === code), `${key} should fail with ${code}`)
    assert.equal(await Notification.countDocuments({ recipientId: students[key]._id, placementDriveId: drive._id, type: 'placement_drive_published' }), 0)
  }

  const applications = {}
  for (const key of ['S01', 'S02', 'S03', 'S04', 'S05', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20']) {
    applications[key] = (await createPlacementDriveApplication(students[key]._id, drive._id, { now: NOW })).application
    assert.deepEqual([applications[key].currentPhase, applications[key].currentStatus, applications[key].phaseHistory[0].event], [0, 'applied', 'applied'])
  }
  await expectCode(createPlacementDriveApplication(students.S01._id, drive._id, { now: NOW }), 'CONFLICT')
  assert.equal((await createPlacementDriveApplication(students.S06._id, drive._id, { now: NOW })).application, null)
  const publishedAt = drive.publishedAt.getTime()
  await extendPlacementDriveApplicationDeadline(drive._id, admin._id, { applicationDeadline: new Date('2035-03-01T00:00:00.000Z') }, { now: NOW })
  assert.equal((await closePlacementDriveApplications(drive._id, admin._id, { now: NOW })).alreadyClosed, false)
  assert.equal((await closePlacementDriveApplications(drive._id, admin._id, { now: NOW })).notificationsCreated, 0)
  assert.equal((await createPlacementDriveApplication(students.S12._id, drive._id, { now: NOW })).application, null)
  await reopenPlacementDriveApplications(drive._id, admin._id, {}, { now: NOW })
  applications.S12 = (await createPlacementDriveApplication(students.S12._id, drive._id, { now: NOW })).application
  assert.ok(applications.S12)
  assert.equal((await closePlacementDriveApplications(drive._id, admin._id, { now: NOW })).alreadyClosed, false)
  assert.equal((await PlacementDrive.findById(drive._id)).publishedAt.getTime(), publishedAt)
  assert.equal(await Application.countDocuments({ placementDriveId: drive._id }), 14)

  const blueprint = (await PlacementDrive.findById(drive._id)).phases.map(item => item.toObject())
  const execution = [
    { phase: 1, value: { status: 'scheduled', instructions: 'Bring an updated resume and review the role.', mode: 'online', instructionPdf: pdf('phase-1-instructions') } },
    { phase: 2, value: { status: 'scheduled', scheduledAt: new Date('2035-01-20T09:00:00.000Z'), deadlineAt: new Date('2035-01-20T11:00:00.000Z'), mode: 'online', instructions: 'Complete both assessment steps.', resources: [{ type: 'test_link', label: 'HackerRank Test', url: 'https://www.hackerrank.com/microsoft-final' }, { type: 'form', label: 'Candidate Form', url: 'https://forms.example.com/microsoft' }], instructionPdf: pdf('phase-2-instructions') } },
    { phase: 3, value: { status: 'scheduled', scheduledAt: new Date('2035-01-24T09:00:00.000Z'), mode: 'online', instructions: 'Join five minutes early.', resources: [{ type: 'meeting_link', label: 'Teams Interview', url: 'https://teams.microsoft.com/l/meetup-join/final' }] } },
    { phase: 4, value: { status: 'scheduled', scheduledAt: new Date('2035-01-26T09:00:00.000Z'), mode: 'offline', venue: `${validationCompanyName} Bengaluru Campus`, instructions: 'Carry college ID.', instructionPdf: pdf('phase-4-instructions') } },
    { phase: 5, value: { status: 'scheduled', scheduledAt: new Date('2035-01-29T10:00:00.000Z'), mode: 'online', instructions: 'Final HR discussion and document check.', resources: [{ type: 'meeting_link', label: 'HR Teams Meeting', url: 'https://teams.microsoft.com/l/meetup-join/hr-final' }] } },
  ]
  for (const item of execution) await updateCompanyPhaseExecution(microsoftUser._id, drive._id, item.phase, item.value)
  assert.deepEqual((await PlacementDrive.findById(drive._id)).phases.map(item => item.toObject()), blueprint)
  assert.equal(phaseExecutionUpdateSchema.safeParse({ resources: [{ type: 'test_link', label: 'Bad', url: 'javascript:alert(1)' }] }).success, false)

  const move = async (key, input) => { applications[key] = await executeCompanyRecruitmentTransition(microsoftUser._id, drive._id, applications[key]._id, input); return applications[key] }
  for (const key of ['S01', 'S02', 'S03', 'S04', 'S05', 'S14', 'S16', 'S17', 'S18', 'S19', 'S20']) await move(key, { action: 'advance', targetPhase: 1 })
  await move('S15', { action: 'reject', reason: 'Resume did not meet role requirements.' })
  applications.S13 = (await withdrawStudentApplication(students.S13._id, applications.S13._id)).application
  assert.deepEqual((await getCompanyRecruitmentWorkspace(microsoftUser._id, drive._id, { placementRecordModel: PlacementRecord })).funnel.phases.map(item => item.count), [1, 11, 0, 0, 0, 0])

  await move('S01', { action: 'advance', targetPhase: 2 })
  const phase1 = await sendCompanyPhaseCandidatesNotification(microsoftUser._id, { placementDriveId: drive._id, phaseNumber: 1, title: 'Screening instructions', message: 'Review the Phase 1 instructions.', requestId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(phase1.recipientCount, 10)
  assert.equal((await sendCompanyPhaseCandidatesNotification(microsoftUser._id, { placementDriveId: drive._id, phaseNumber: 1, title: 'Screening instructions', message: 'Review the Phase 1 instructions.', requestId: '11111111-1111-4111-8111-111111111111' })).alreadySent, true)
  for (const key of ['S12', 'S13', 'S15']) assert.equal(await Notification.countDocuments({ recipientId: students[key]._id, type: 'company_to_phase_candidates', phaseNumber: 1 }), 0)

  await move('S01', { action: 'advance', targetPhase: 3 })
  for (const key of ['S02', 'S03', 'S04', 'S14', 'S16', 'S17', 'S18', 'S19', 'S20']) await move(key, { action: 'advance', targetPhase: 2 })
  const phase2 = await sendCompanyPhaseCandidatesNotification(microsoftUser._id, { placementDriveId: drive._id, phaseNumber: 2, title: 'Online assessment', message: 'Use the HackerRank and Form links.', requestId: '22222222-2222-4222-8222-222222222222' })
  assert.equal(phase2.recipientCount, 9)
  assert.equal(await Notification.countDocuments({ recipientId: students.S01._id, phaseNumber: 2, type: 'company_to_phase_candidates' }), 0)
  const s14Phase2 = await getStudentCurrentPhaseExecution(students.S14._id, applications.S14._id)
  assert.equal(s14Phase2.execution.resources.length, 2)
  assert.equal(JSON.stringify(s14Phase2).includes('/private/'), false)
  assert.equal((await getStudentCurrentPhaseExecution(students.S05._id, applications.S05._id)).phase.phaseNumber, 1)
  assert.equal((await getStudentCurrentPhaseExecution(students.S01._id, applications.S01._id)).phase.phaseNumber, 3)
  await expectCode(getStudentCurrentPhaseExecution(students.S02._id, applications.S14._id), 'NOT_FOUND')

  await move('S14', { action: 'mark_absent', reason: 'Candidate missed the scheduled assessment.' })
  assert.equal((await getStudentRecruitmentJourney(students.S14._id, applications.S14._id, { placementRecordModel: PlacementRecord })).currentPhaseExecution, null)
  assert.equal((await getCompanyPhaseCandidateRecipientCount(microsoftUser._id, drive._id, 2)).recipientCount, 8)
  await move('S14', { action: 'restore_absent', reason: 'Approved reschedule granted.' })
  assert.equal((await getStudentCurrentPhaseExecution(students.S14._id, applications.S14._id)).phase.phaseNumber, 2)
  assert.deepEqual(applications.S14.phaseHistory.slice(-2).map(item => item.event), ['marked_absent', 'restored_absent'])

  await move('S18', { action: 'reject', reason: 'Recruitment decision after assessment review.' })
  const incident = await createCompanyIncidentReport(microsoftUser._id, { applicationId: applications.S18._id, category: 'cheating', description: 'Suspicious similarity detected during the online assessment.', note: 'Company allegation for Admin review.' })
  assert.equal(incident.category, 'cheating')
  assert.equal(await IncidentReport.countDocuments({ applicationId: applications.S18._id }), 1)
  assert.equal(await PlacementRestriction.countDocuments({ studentId: students.S18._id }), 0)
  assert.equal((await Application.findById(applications.S18._id)).currentStatus, 'rejected')

  for (const key of ['S02', 'S03', 'S04', 'S14', 'S16', 'S17', 'S19', 'S20']) await move(key, { action: 'advance', targetPhase: 3 })
  assert.equal((await sendCompanyPhaseCandidatesNotification(microsoftUser._id, { placementDriveId: drive._id, phaseNumber: 3, title: 'Technical interview 1', message: 'Join using the Teams resource.', requestId: '33333333-3333-4333-8333-333333333333' })).recipientCount, 9)
  assert.equal((await exportCompanyRecruitmentCandidates(microsoftUser._id, drive._id, { phase: 3 }, { placementRecordModel: PlacementRecord })).rowCount, 9)

  await move('S16', { action: 'advance', targetPhase: 4 })
  await move('S16', { action: 'move_backward', targetPhase: 3, reason: 'Interview score was mapped to the wrong round.' })
  await move('S16', { action: 'advance', targetPhase: 4 })
  assert.deepEqual(applications.S16.phaseHistory.slice(-3).map(item => item.event), ['advanced', 'moved_backward', 'advanced'])
  for (const key of ['S01', 'S02', 'S03', 'S04', 'S14', 'S17', 'S19', 'S20']) await move(key, { action: 'advance', targetPhase: 4 })
  await move('S03', { action: 'reject', reason: 'Technical bar not met.' })
  await move('S04', { action: 'mark_absent', reason: 'Missed original interview slot.' })
  await move('S04', { action: 'restore_absent', reason: 'Recruiter approved a new slot.' })
  for (const key of ['S01', 'S02', 'S04', 'S14', 'S17', 'S19', 'S20']) await move(key, { action: 'advance', targetPhase: 5 })
  await expectCode(move('S16', { action: 'provisionally_select' }), 'CONFLICT')
  await move('S01', { action: 'reject', reason: 'Final interview decision.' })
  await move('S02', { action: 'mark_absent', reason: 'Missed HR interview.' })
  for (const key of ['S17', 'S19', 'S20']) { await move(key, { action: 'provisionally_select' }); await notifyProvisionalSelection(applications[key], 'provisionally_select', microsoftUser._id) }
  assert.equal((await getCompanyRecruitmentWorkspace(microsoftUser._id, drive._id, { placementRecordModel: PlacementRecord })).funnel.provisionalSelected, 3)

  let s17Record = await submitPlacementReport(students.S17._id, applications.S17._id, { outcomeType: 'full_time', package: { amount: 1700000, currency: 'INR', period: 'per_annum' }, location: 'Bengaluru' })
  await move('S17', { action: 'unselect', reason: 'Final panel requested another review.' })
  await invalidateUnselectedPlacementReport(applications.S17._id, microsoftUser._id)
  await notifyProvisionalSelection(applications.S17, 'unselect', microsoftUser._id)
  assert.equal((await PlacementRecord.findById(s17Record._id)).verificationState, 'rejected')
  await move('S17', { action: 'provisionally_select' })
  await notifyProvisionalSelection(applications.S17, 'provisionally_select', microsoftUser._id)
  s17Record = await submitPlacementReport(students.S17._id, applications.S17._id, { outcomeType: 'full_time', package: { amount: 1700000, currency: 'INR', period: 'per_annum' }, location: 'Bengaluru' })
  assert.equal(await Application.countDocuments({ studentId: students.S17._id, placementDriveId: drive._id }), 1)
  assert.ok(applications.S17.phaseHistory.some(item => item.event === 'unselected'))

  let s19Record = await submitPlacementReport(students.S19._id, applications.S19._id, { outcomeType: 'full_time', package: { amount: validationCtc, currency: 'INR', period: 'per_annum' }, location: 'Bengaluru', joiningPeriod: 'July 2035' })
  s19Record = await submitPlacementReport(students.S19._id, applications.S19._id, { outcomeType: 'full_time', package: { amount: validationCtc, currency: 'INR', period: 'per_annum' }, location: 'Bengaluru', joiningPeriod: 'July 2035' })
  const validProof = path.join(temp, 'offer.pdf'); await writeFile(validProof, Buffer.from('%PDF-1.4\nM7 final proof'))
  const invalidProof = path.join(temp, 'offer.txt'); await writeFile(invalidProof, Buffer.from('not a pdf'))
  await savePlacementProof(students.S19._id, applications.S19._id, { path: validProof, originalname: 'offer.pdf', mimetype: 'application/pdf', size: 24 })
  await expectCode(savePlacementProof(students.S19._id, applications.S19._id, { path: invalidProof, originalname: 'offer.pdf', mimetype: 'application/pdf', size: 9 }), 'VALIDATION_ERROR')
  await getPlacementProof(students.S19._id, s19Record._id, 0)
  await getPlacementProof(admin._id, s19Record._id, 0, { isAdmin: true })
  await expectCode(getPlacementProof(students.S01._id, s19Record._id, 0), 'NOT_FOUND')
  assert.equal(JSON.stringify(await getStudentRecruitmentJourney(students.S19._id, applications.S19._id, { placementRecordModel: PlacementRecord })).includes('storagePath'), false)

  const tcsDrive = await publishedDrive(tcs._id, 'TCS Digital Engineer', 2)
  const infosysDrive = await publishedDrive(tcs._id, 'Infosys Systems Engineer', 1)
  const internshipFutureDrive = await publishedDrive(tcs._id, 'Future FTE Engineer', 1)
  const tcsApply = (await createPlacementDriveApplication(students.S19._id, tcsDrive._id, { now: NOW })).application
  await executeCompanyRecruitmentTransition(tcsUser._id, tcsDrive._id, tcsApply._id, { action: 'advance', targetPhase: 1 })
  const tcsPhase2 = await executeCompanyRecruitmentTransition(tcsUser._id, tcsDrive._id, tcsApply._id, { action: 'advance', targetPhase: 2 })
  const confirmation = await confirmPlacementRecord(admin._id, s19Record._id, {})
  assert.deepEqual([confirmation.record.verificationState, (await Application.findById(applications.S19._id)).currentStatus, confirmation.closedApplications], ['confirmed', 'placement_confirmed', 1])
  assert.equal((await Application.findById(tcsPhase2._id)).currentStatus, 'closed_placed_elsewhere')
  assert.equal(await Notification.countDocuments({ recipientId: students.S19._id, applicationId: tcsPhase2._id, type: 'application_closed_placed_elsewhere' }), 1)
  const blockedInfosys = await createPlacementDriveApplication(students.S19._id, infosysDrive._id, { now: NOW, enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.equal(blockedInfosys.application, null)
  assert.ok(blockedInfosys.reasons.some(reason => reason.code === 'placement_confirmed_elsewhere'))
  assert.equal(await Application.countDocuments({ studentId: students.S19._id, placementDriveId: infosysDrive._id }), 0)
  await confirmPlacementRecord(admin._id, s19Record._id, {})
  assert.equal((await PlacementRecord.findById(s19Record._id)).history.filter(item => item.event === 'admin_confirmed').length, 1)
  assert.equal((await Application.findById(applications.S19._id)).phaseHistory.filter(item => item.event === 'placement_confirmed').length, 1)

  await Application.updateOne({ _id: applications.S19._id }, { $set: { currentStatus: 'selected_pending_confirmation' } })
  const beforeRecoveryNotices = await Notification.countDocuments({ recipientId: students.S19._id })
  const recovery = await confirmPlacementRecord(admin._id, s19Record._id, {})
  assert.equal(recovery.repaired, true)
  assert.equal((await Application.findById(applications.S19._id)).phaseHistory.filter(item => item.event === 'placement_confirmed').length, 1)
  assert.equal(await Notification.countDocuments({ recipientId: students.S19._id }), beforeRecoveryNotices)
  assert.equal((await Application.findById(tcsPhase2._id)).phaseHistory.filter(item => item.event === 'closed_placed_elsewhere').length, 1)

  await decidePlacementRecord(admin._id, s19Record._id, 'revoke', 'Offer withdrawn after verification.')
  assert.equal((await PlacementRecord.findById(s19Record._id)).history.at(-1).event, 'admin_revoked')
  const infosysAfterRevoke = await createPlacementDriveApplication(students.S19._id, infosysDrive._id, { now: NOW, enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.ok(infosysAfterRevoke.application)
  assert.equal((await Application.findById(tcsPhase2._id)).currentStatus, 'closed_placed_elsewhere')
  assert.equal((await Application.findById(applications.S19._id)).currentStatus, 'placement_confirmed')

  const s20Record = await submitPlacementReport(students.S20._id, applications.S20._id, { outcomeType: 'internship', stipend: { amount: 75000, currency: 'INR', period: 'per_month' }, location: 'Bengaluru' })
  await confirmPlacementRecord(admin._id, s20Record._id, {})
  const futureFte = await createPlacementDriveApplication(students.S20._id, internshipFutureDrive._id, { now: NOW, enforceConfirmedPlacementLock: true, placementRecordModel: PlacementRecord })
  assert.equal(futureFte.application, null)

  const adminMonitoring = await getAdminPublishedDriveMonitoring(drive._id, { placementRecordModel: PlacementRecord })
  const companyMonitoring = await getCompanyRecruitmentWorkspace(microsoftUser._id, drive._id, { placementRecordModel: PlacementRecord })
  const actual = await Application.find({ placementDriveId: drive._id }).lean()
  const currentPhaseCounts = [0, 1, 2, 3, 4, 5].map(phase => actual.filter(item => item.currentPhase === phase && ['applied', 'active'].includes(item.currentStatus)).length)
  assert.deepEqual(adminMonitoring.funnel.phases.map(item => item.count), currentPhaseCounts)
  assert.deepEqual(companyMonitoring.funnel.phases.map(item => item.count), currentPhaseCounts)
  for (const status of ['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere', 'selected_pending_confirmation', 'placement_confirmed']) assert.equal(adminMonitoring.funnel.statuses[status], actual.filter(item => item.currentStatus === status).length)
  assert.equal(companyMonitoring.funnel.confirmationPending, 1)
  assert.equal(companyMonitoring.funnel.placementConfirmed, 1)
  await expectCode(getCompanyRecruitmentWorkspace(tcsUser._id, drive._id, { placementRecordModel: PlacementRecord }), 'NOT_FOUND')

  const activity = await listCompanyRecruitmentActivity(microsoftUser._id, drive._id, { placementRecordModel: PlacementRecord })
  const actions = new Set(activity.events.map(item => item.action))
  for (const action of ['applied', 'advanced', 'moved_backward', 'marked_absent', 'restored_absent', 'rejected', 'withdrawn', 'provisionally_selected', 'unselected', 'placement_confirmed', 'placement_revoked']) assert.ok(actions.has(action), `missing activity ${action}`)
  assert.equal(activity.events.every((item, index) => index === 0 || new Date(activity.events[index - 1].at) >= new Date(item.at)), true)
  const activityText = JSON.stringify(activity)
  for (const secret of ['storagePath', 'proof', 'Admin review', 'Offer withdrawn after verification']) assert.equal(activityText.includes(secret), false)
  const sent = await listSentNotifications(microsoftUser._id)
  assert.ok(sent.some(item => item.type === 'company_to_phase_candidates'))

  const phase0Export = await exportCompanyRecruitmentCandidates(microsoftUser._id, drive._id, { phase: 0 }, { placementRecordModel: PlacementRecord })
  const phase2Export = await exportCompanyRecruitmentCandidates(microsoftUser._id, drive._id, { phase: 2 }, { placementRecordModel: PlacementRecord })
  const phase5Export = await exportCompanyRecruitmentCandidates(microsoftUser._id, drive._id, { phase: 5 }, { placementRecordModel: PlacementRecord })
  const selectedExport = await exportCompanyRecruitmentCandidates(microsoftUser._id, drive._id, { selectedOnly: true }, { placementRecordModel: PlacementRecord })
  assert.deepEqual([phase0Export.rowCount, phase2Export.rowCount, phase5Export.rowCount, selectedExport.rowCount], [3, 1, 7, 3])
  assert.ok(selectedExport.buffer.length > 1000)
  const selectedWorkbook = new ExcelJS.Workbook()
  await selectedWorkbook.xlsx.load(selectedExport.buffer)
  const selectedSheet = selectedWorkbook.worksheets[0]
  const expectedSelectedHeaders = ['Name', 'Roll Number', 'Email', 'Branch', 'CGPA', 'Current Phase', 'Current Status', 'Confirmation State', 'Outcome Type', 'Company', 'Role']
  // Recruitment exports use the shared professional workbook layout: title,
  // generated metadata, then the actual table header.
  assert.equal(selectedSheet.getCell('A1').value, 'Apex Institute of Technology | Microsoft candidates')
  assert.match(String(selectedSheet.getCell('A2').value), /^Generated /)
  assert.deepEqual(selectedSheet.getRow(3).values.slice(1), expectedSelectedHeaders)
  assert.equal(selectedSheet.actualRowCount, selectedExport.rowCount + 3)
  assert.ok(selectedSheet.getRow(4).values.slice(1).some(Boolean))
  await expectCode(exportCompanyRecruitmentCandidates(tcsUser._id, drive._id, { selectedOnly: true }, { placementRecordModel: PlacementRecord }), 'NOT_FOUND')

  const lifecycleDrive = await publishedDrive(microsoft._id, 'Lifecycle Validation', 1)
  const lifecycleApply = (await createPlacementDriveApplication(students.S05._id, lifecycleDrive._id, { now: NOW })).application
  const lifecycleHistory = lifecycleApply.phaseHistory.map(item => item.toObject())
  const postponed = await postponePlacementDrive(lifecycleDrive._id, admin._id, 'Interview panel is unavailable.', { now: NOW })
  assert.deepEqual([postponed.drive.lifecycleStatus, postponed.alreadyChanged], ['postponed', false])
  await expectCode(executeCompanyRecruitmentTransition(microsoftUser._id, lifecycleDrive._id, lifecycleApply._id, { action: 'advance', targetPhase: 1 }), 'CONFLICT')
  const cancelled = await cancelPlacementDrive(lifecycleDrive._id, admin._id, 'Company cancelled the recruitment visit.', { now: NOW })
  assert.deepEqual([cancelled.drive.lifecycleStatus, cancelled.alreadyChanged], ['cancelled', false])
  await expectCode(executeCompanyRecruitmentTransition(microsoftUser._id, lifecycleDrive._id, lifecycleApply._id, { action: 'advance', targetPhase: 1 }), 'CONFLICT')
  const lifecycleApplication = await Application.findById(lifecycleApply._id)
  assert.deepEqual([lifecycleApplication.currentStatus, lifecycleApplication.phaseHistory.map(item => item.toObject())], ['applied', lifecycleHistory])

  await expectCode(executeCompanyRecruitmentTransition(microsoftUser._id, drive._id, applications.S16._id, { action: 'move_backward', targetPhase: 3 }), 'VALIDATION_ERROR')
  await expectCode(executeCompanyRecruitmentTransition(microsoftUser._id, drive._id, applications.S13._id, { action: 'advance', targetPhase: 1 }), 'CONFLICT')
  await expectCode(executeCompanyRecruitmentTransition(microsoftUser._id, drive._id, applications.S20._id, { action: 'advance', targetPhase: 6 }), 'VALIDATION_ERROR')
  assert.equal(await Application.countDocuments({ placementDriveId: drive._id }), 14)
})
