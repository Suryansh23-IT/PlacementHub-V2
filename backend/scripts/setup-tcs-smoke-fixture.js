import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { User } from '../src/modules/auth/auth.model.js'
import { USER_ROLES } from '../src/modules/auth/auth.constants.js'
import { Company } from '../src/modules/companies/company.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { StudentPlacementPolicy, StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { Application } from '../src/modules/applications/application.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { IncidentReport } from '../src/modules/incidents/incident-report.model.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'
import { InstitutionProfile } from '../src/modules/institution/institution.model.js'
import { getActivePolicy } from '../src/modules/student-policy/student-policy.service.js'
import { DemoSeedStore } from './demo-seed-store.js'
import { removeTcsSmokeFixture, TCS_SMOKE_FIXTURE_KEY } from './tcs-smoke-fixture-store.js'

const KEY = TCS_SMOKE_FIXTURE_KEY
const PASSWORD = '12345678'
const branches = ['Information Technology', 'Computer Science and Engineering', 'Electronics and Communication Engineering', 'Electrical Engineering']
const pdf = name => ({ originalName: `${name}.pdf`, storagePath: `fixture://tcs-smoke/${name}.pdf`, mimeType: 'application/pdf', size: 128, uploadedAt: new Date() })

async function run() {
  await connectDatabase()
  try {
    const institution = await InstitutionProfile.findOne({ singletonKey: 'placementhub-v2' }).lean()
    if (!institution || branches.some(branch => !institution.branches?.includes(branch))) throw new Error('The local InstitutionProfile must contain the four TCS smoke-fixture branches.')
    const admin = await User.findOne({ role: USER_ROLES.PLACEMENT_ADMIN })
    if (!admin) throw new Error('A local Placement Admin account is required for the smoke fixture.')
    await removeTcsSmokeFixture()
    const store = await DemoSeedStore.create({ key: KEY, status: 'starting', studentUserIds: [], companyUserIds: [], companyProfileIds: [], pdfDirectory: 'fixture://tcs-smoke' })
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const companyUser = await User.create({ name: 'TCS Campus Recruitment', email: 'tcs.smoke@fixture.local', passwordHash, role: USER_ROLES.COMPANY })
    const company = await Company.create({ userId: companyUser._id, companyName: 'TCS', industry: 'IT Services', location: 'Bengaluru', officialEmail: 'campus@tcs.fixture.local', recruiterName: 'TCS Campus Team', approvalStatus: 'approved' })
    store.companyUserIds.push(companyUser._id); store.companyProfileIds.push(company._id)
    const recruiterPolicy = await RecruiterPlacementPolicy.findOne({ active: true })
    if (!recruiterPolicy) throw new Error('An active Recruiter Placement Policy is required for the smoke fixture.')
    await RecruiterPolicyAcceptance.create({ companyId: companyUser._id, policyId: recruiterPolicy._id, policyVersion: recruiterPolicy.version, acceptedAt: new Date() })
    const studentPolicy = await getActivePolicy()
    const definitions = [
      ['smoke.active', 'Smoke Active Applicant', branches[0], 8.4, 0, true], ['smoke.active2', 'Smoke Active Two', branches[1], 8.1, 0, true], ['smoke.active3', 'Smoke Active Three', branches[2], 7.9, 0, true], ['smoke.exited', 'Smoke Withdrawn Candidate', branches[3], 8.0, 0, true], ['smoke.ineligible', 'Smoke Low CGPA', branches[0], 6.1, 0, true], ['smoke.pending', 'Smoke Pending Discipline', branches[1], 8.2, 0, true],
    ]
    const students = {}
    for (const [emailKey, name, branch, cgpa, activeBacklogs, accepted] of definitions) {
      const account = await User.create({ name, email: `${emailKey}@fixture.local`, passwordHash, role: USER_ROLES.STUDENT }); students[emailKey] = account; store.studentUserIds.push(account._id)
      await StudentProfile.create({ userId: account._id, branch, graduationYear: 2027, cgpa, activeBacklogs, verificationStatus: 'verified', rollNumber: `SMK${String(store.studentUserIds.length).padStart(3, '0')}`, phone: '9000000000', skills: ['Java', 'SQL', 'Git'], projects: [{ title: 'Campus Service Portal', description: 'Fixture project for smoke verification.', technologies: ['Java', 'SQL'] }], resume: pdf(`${emailKey}-resume`), collegeResult: pdf(`${emailKey}-result`) })
      if (accepted) await StudentPolicyAcceptance.create({ studentId: account._id, policyId: studentPolicy._id, policyVersion: studentPolicy.version, acceptedAt: new Date() })
    }
    const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    const drive = await PlacementDrive.create({ companyId: company._id, role: { title: 'Software Engineer 2027', domain: 'Software Engineering', employmentType: 'full_time', description: 'TCS campus software engineering role.', requiredSkills: ['Java', 'SQL', 'Git'] }, driveDetails: { workMode: 'hybrid', workLocation: 'Bengaluru', expectedHires: 15, compensation: { amount: 700000, currency: 'INR', period: 'per_annum' }, applicationDeadline: deadline }, eligibility: { minimumCgpa: 7, allowedBranches: branches, maximumActiveBacklogs: 0, graduationYears: [2027] }, documents: { companyRecruitmentInformation: pdf('tcs-company'), placementDriveJobDescription: pdf('tcs-jd') }, phases: [{ phaseNumber: 1, title: 'Online assessment', type: 'assessment', description: 'Assessment.' }, { phaseNumber: 2, title: 'Technical interview', type: 'technical_interview', description: 'Interview.' }], proposalStatus: 'approved', lifecycleStatus: 'published', publishedAt: new Date() })
    const activeKeys = ['smoke.active', 'smoke.active2', 'smoke.active3', 'smoke.pending']
    const applications = {}
    for (const key of activeKeys) applications[key] = await Application.create({ studentId: students[key]._id, placementDriveId: drive._id, currentPhase: 0, currentStatus: 'applied', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date() }] })
    applications['smoke.exited'] = await Application.create({ studentId: students['smoke.exited']._id, placementDriveId: drive._id, currentPhase: 0, currentStatus: 'withdrawn', withdrawnAt: new Date(), phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date(Date.now() - 3600000) }, { phase: 0, status: 'withdrawn', event: 'withdrawn', occurredAt: new Date() }] })
    const batch = randomUUID(); const sent = activeKeys.map(recipientIdKey => ({ recipientId: students[recipientIdKey]._id, senderId: admin._id, notificationBatchId: batch, category: 'manual_placement_message', type: 'admin_to_students', source: 'college', title: 'TCS assessment update', message: 'Assessment information for active candidates.', placementDriveId: drive._id, companyId: company._id, context: { action: 'view_drive', audience: 'drive_applicants' } }))
    sent[0].isRead = true; await Notification.create(sent)
    await Notification.create([{ recipientId: students['smoke.active']._id, senderId: admin._id, category: 'placement_drive', type: 'placement_drive_published', source: 'placement_system', title: 'New Placement Drive open', message: 'TCS Software Engineer 2027 is open.', placementDriveId: drive._id, companyId: company._id, context: { action: 'view_drive', audience: 'eligible_students' } }, { recipientId: admin._id, senderId: companyUser._id, notificationBatchId: randomUUID(), category: 'manual_placement_message', type: 'company_to_admin', source: 'company', title: 'TCS confirmation', message: 'TCS confirms the candidate workspace.', placementDriveId: drive._id, companyId: company._id, context: { action: 'view_drive', audience: 'placement_admin' } }])
    const past = await IncidentReport.create({ studentId: students['smoke.exited']._id, applicationId: applications['smoke.exited']._id, placementDriveId: drive._id, companyId: company._id, phase: 0, applicationStatus: 'withdrawn', category: 'withdrawal', description: 'Fixture withdrawal case.', reportedBy: companyUser._id, reviewStatus: 'closed', decision: 'warning_only', reviewNote: 'Historical warning.', reviewedBy: admin._id, reviewedAt: new Date(), archivedBy: admin._id, archivedAt: new Date() })
    await PlacementRestriction.create({ studentId: students['smoke.exited']._id, sourceIncidentReportId: past._id, placementDriveId: drive._id, applicationId: applications['smoke.exited']._id, type: 'temporary_drive_count', status: 'inactive', initialDriveCount: 5, remainingDriveCount: 5, reason: 'Historical fixture restriction.', imposedBy: admin._id, removedBy: admin._id, removedAt: new Date(), removalReason: 'Restored for fixture.', inactiveReason: 'removed_by_admin' })
    await IncidentReport.create({ studentId: students['smoke.pending']._id, applicationId: applications['smoke.pending']._id, placementDriveId: drive._id, companyId: company._id, phase: 0, applicationStatus: 'applied', category: 'misconduct', description: 'Pending fixture review.', reportedBy: companyUser._id })
    store.status = 'ready'; await store.save()
    const manifest = { fixture: KEY, drive: { id: String(drive._id), code: `DRV-${String(drive._id).slice(-8).toUpperCase()}`, role: drive.role.title, window: 'Open', deadline }, credentials: { company: { email: companyUser.email, password: PASSWORD }, activeStudent: { email: students['smoke.active'].email, password: PASSWORD }, ineligibleStudent: { email: students['smoke.ineligible'].email, password: PASSWORD }, admin: { email: admin.email, password: PASSWORD } }, counts: { total: 5, active: 4, exited: 1 }, notifications: { sentRecipients: 4, sentRead: 1, sentUnread: 3 }, discipline: { pending: 1, past: 1 } }
    const manifestDirectory = path.resolve('scripts', '.local')
    const manifestPath = path.join(manifestDirectory, 'tcs-smoke-fixture-manifest.json')
    await mkdir(manifestDirectory, { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.info(JSON.stringify({ ...manifest, manifestPath }, null, 2))
  } finally { await disconnectDatabase() }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
