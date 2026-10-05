import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { Company } from '../companies/company.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Application } from './application.model.js'
import { getApplicationWindowStatus } from '../placement-drives/placement-drive.application-window.js'
import { PlacementRecord } from '../placements/placement-record.model.js'

const publishedQuery = () => ({ proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })
const notFound = () => new AppError('Published Placement Drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })

function plain(value) { return value?.toObject ? value.toObject() : value }

async function companySummary(companyId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ _id: companyId })
  if (!company) return null
  const value = plain(company)
  return { userId: value.userId, companyName: value.companyName, industry: value.industry, officialEmail: value.officialEmail, location: value.location }
}

function publicDrive(drive, company) {
  const value = plain(drive)
  return {
    _id: value._id,
    company,
    role: value.role,
    driveDetails: value.driveDetails,
    eligibility: value.eligibility,
    phases: (value.phases ?? []).filter(phase => phase.phaseNumber >= 1),
    proposalStatus: value.proposalStatus,
    lifecycleStatus: value.lifecycleStatus,
    applicationWindow: getApplicationWindowStatus(value),
    applicationDeadlineExtendedAt: value.applicationDeadlineExtendedAt,
  }
}

export async function listAdminPublishedDriveMonitoring({ placementDriveModel = PlacementDrive, applicationModel = Application, companyModel = Company } = {}) {
  const drives = await placementDriveModel.find(publishedQuery()).sort({ 'driveDetails.applicationDeadline': 1 })
  return Promise.all(drives.map(async drive => {
    const [company, applicationCount, activeApplicantCount, exitedApplicantCount] = await Promise.all([
      companySummary(drive.companyId, { companyModel }),
      applicationModel.countDocuments({ placementDriveId: drive._id }),
      applicationModel.countDocuments({ placementDriveId: drive._id, currentStatus: { $in: ['applied', 'active'] } }),
      applicationModel.countDocuments({ placementDriveId: drive._id, currentStatus: { $in: ['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere'] } }),
    ])
    return { ...publicDrive(drive, company), applicationCount, activeApplicantCount, exitedApplicantCount }
  }))
}

async function getPublishedDrive(driveId, { placementDriveModel = PlacementDrive } = {}) {
  const drive = await placementDriveModel.findOne({ _id: driveId, proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: { $in: [PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.CANCELLED] } })
  if (!drive) throw notFound()
  return drive
}

function publicStudent(application, user, profile) {
  const value = plain(application)
  const student = plain(profile)
  return {
    applicationId: value._id,
    studentId: value.studentId,
    name: user.name,
    rollNumber: student.rollNumber,
    branch: student.branch,
    appliedAt: value.appliedAt,
    currentPhase: value.currentPhase,
    currentStatus: value.currentStatus,
  }
}

export async function getAdminPublishedDriveMonitoring(driveId, dependencies = {}) {
  const { applicationModel = Application, userModel = User, profileModel = StudentProfile, companyModel = Company, placementRecordModel = null } = dependencies
  const drive = await getPublishedDrive(driveId, dependencies)
  const applications = await applicationModel.find({ placementDriveId: drive._id }).sort({ appliedAt: -1 })
  const students = await Promise.all(applications.map(async application => {
    const value = plain(application)
    const [user, profile] = await Promise.all([
      userModel.findOne({ _id: value.studentId, role: USER_ROLES.STUDENT }),
      profileModel.findOne({ userId: value.studentId }),
    ])
    return user && profile ? publicStudent(application, plain(user), profile) : null
  }))
  const company = await companySummary(drive.companyId, { companyModel })
  const visibleStudents = students.filter(Boolean)
  const exitedCount = applications.filter(application => plain(application).currentStatus === 'withdrawn').length
  const records = placementRecordModel ? await placementRecordModel.find({ placementDriveId: drive._id }) : []; const recordByApplication = new Map(records.map(record => [String(plain(record).applicationId), plain(record)])); const funnel = { total: applications.length, phases: [0, ...(drive.phases ?? []).map(phase => phase.phaseNumber)].map(phaseNumber => ({ phaseNumber, count: applications.filter(item => plain(item).currentPhase === phaseNumber && ['active', 'applied'].includes(plain(item).currentStatus)).length })), statuses: Object.fromEntries(['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere', 'selected_pending_confirmation', 'placement_confirmed'].map(status => [status, applications.filter(item => plain(item).currentStatus === status).length])), confirmationPending: records.filter(record => plain(record).verificationState === 'pending_admin_verification').length, confirmedPlacements: records.filter(record => plain(record).verificationState === 'confirmed').length }
  const enriched = visibleStudents.map(student => ({ ...student, confirmationState: recordByApplication.get(String(student.applicationId))?.verificationState }))
  return { drive: publicDrive(drive, company), applicationCount: applications.length, students: enriched, funnel, summary: { proposalStatus: drive.proposalStatus, lifecycleStatus: drive.lifecycleStatus, applicationDeadline: drive.driveDetails?.applicationDeadline, applicantCount: applications.length - exitedCount, exitedCount, phaseCount: (drive.phases ?? []).filter(phase => phase.phaseNumber >= 1).length, companyId: drive.companyId, roleTitle: drive.role?.title } }
}
