import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { Company } from '../companies/company.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Application } from './application.model.js'
import { getApplicationWindowStatus } from '../placement-drives/placement-drive.application-window.js'

const notFound = () => new AppError('Placement Drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const applicantNotFound = () => new AppError('Applicant was not found in this Placement Drive.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const resumeMissing = () => new AppError('This applicant has not uploaded a resume.', { statusCode: 404, errorCode: 'NOT_FOUND' })

function plain(value) { return value?.toObject ? value.toObject() : value }

function publicCompany(company) {
  const value = plain(company)
  return { companyName: value?.companyName, industry: value?.industry, location: value?.location, officialEmail: value?.officialEmail }
}

async function getOwnedPublishedDrive(companyUserId, driveId, { companyModel = Company, placementDriveModel = PlacementDrive } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved companies can access Placement Drive applicants.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: driveId, companyId: company._id })
  if (!drive) throw notFound()
  if (drive.lifecycleStatus !== PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED) {
    throw new AppError('Applicants are available after this Placement Drive is published.', { statusCode: 409, errorCode: 'CONFLICT' })
  }
  return { drive, company }
}

function publicResume(resume, driveId, studentId) {
  if (!resume) return undefined
  const { storagePath, ...metadata } = plain(resume)
  return { ...metadata, downloadUrl: `/api/v1/companies/me/placement-drives/${driveId}/applicants/${studentId}/resume/download` }
}

function recruitmentProfile(user, profile, driveId, studentId) {
  const value = plain(profile)
  return {
    studentId,
    name: user.name,
    rollNumber: value.rollNumber,
    branch: value.branch,
    cgpa: value.cgpa,
    activeBacklogs: value.activeBacklogs,
    graduationYear: value.graduationYear,
    resume: publicResume(value.resume, driveId, studentId),
    skills: value.skills ?? [],
    skillGroups: value.skillGroups ?? [],
    projects: value.projects ?? [],
    professionalLinks: value.professionalLinks ?? {},
    codingProfiles: value.codingProfiles ?? [],
  }
}

async function getApplicantRecord(companyUserId, driveId, studentId, dependencies = {}) {
  const { applicationModel = Application, userModel = User, profileModel = StudentProfile } = dependencies
  const { drive, company } = await getOwnedPublishedDrive(companyUserId, driveId, dependencies)
  // A recruiter may open a candidate profile from any current recruitment
  // phase. Phase 0 is only a list/pool concern, not an authorization boundary
  // for an application that already belongs to this Company Drive.
  const application = await applicationModel.findOne({ placementDriveId: drive._id, studentId })
  if (!application) throw applicantNotFound()
  const [user, profile] = await Promise.all([
    userModel.findOne({ _id: studentId, role: USER_ROLES.STUDENT }),
    profileModel.findOne({ userId: studentId }),
  ])
  if (!user || !profile) throw applicantNotFound()
  return { drive, company, application, user: plain(user), profile }
}

function publicApplication(application, student) {
  const value = plain(application)
  return {
    applicationId: value._id,
    appliedAt: value.appliedAt,
    currentPhase: value.currentPhase,
    currentStatus: value.currentStatus,
    student,
  }
}

export async function listCompanyDriveApplicants(companyUserId, driveId, dependencies = {}) {
  const { applicationModel = Application, userModel = User, profileModel = StudentProfile } = dependencies
  const { drive, company } = await getOwnedPublishedDrive(companyUserId, driveId, dependencies)
  const applications = await applicationModel.find({ placementDriveId: drive._id, currentPhase: 0, currentStatus: { $ne: 'withdrawn' } }).sort({ appliedAt: -1 })
  const applicants = await Promise.all(applications.map(async application => {
    const applicationValue = plain(application)
    const [user, profile] = await Promise.all([
      userModel.findOne({ _id: applicationValue.studentId, role: USER_ROLES.STUDENT }),
      profileModel.findOne({ userId: applicationValue.studentId }),
    ])
    if (!user || !profile) return null
    return publicApplication(application, recruitmentProfile(plain(user), profile, drive._id, applicationValue.studentId))
  }))
  const value = plain(drive)
  const exitedApplications = await applicationModel.find({ placementDriveId: drive._id, currentPhase: 0, currentStatus: 'withdrawn' }).sort({ withdrawnAt: -1, appliedAt: -1 })
  const exited = await Promise.all(exitedApplications.map(async application => {
    const applicationValue = plain(application)
    const [user, profile] = await Promise.all([
      userModel.findOne({ _id: applicationValue.studentId, role: USER_ROLES.STUDENT }),
      profileModel.findOne({ userId: applicationValue.studentId }),
    ])
    if (!user || !profile) return null
    return publicApplication(application, recruitmentProfile(plain(user), profile, drive._id, applicationValue.studentId))
  }))
  return {
    drive: { _id: value._id, company: publicCompany(company), role: value.role, driveDetails: value.driveDetails, proposalStatus: value.proposalStatus, lifecycleStatus: value.lifecycleStatus, applicationWindow: getApplicationWindowStatus(value), applicationDeadlineExtendedAt: value.applicationDeadlineExtendedAt },
    applicants: applicants.filter(Boolean),
    exited: exited.filter(Boolean),
    summary: { proposalStatus: value.proposalStatus, lifecycleStatus: value.lifecycleStatus, applicationDeadline: value.driveDetails?.applicationDeadline, applicantCount: applicants.filter(Boolean).length, exitedCount: exited.filter(Boolean).length, phaseCount: (value.phases ?? []).filter(phase => phase.phaseNumber >= 1).length, companyId: value.companyId, roleTitle: value.role?.title },
  }
}

export async function getCompanyDriveApplicant(companyUserId, driveId, studentId, dependencies = {}) {
  const record = await getApplicantRecord(companyUserId, driveId, studentId, dependencies)
  const student = recruitmentProfile(record.user, record.profile, record.drive._id, studentId)
  const value = plain(record.drive)
  return { drive: { _id: value._id, company: publicCompany(record.company), role: value.role, driveDetails: value.driveDetails, proposalStatus: value.proposalStatus, lifecycleStatus: value.lifecycleStatus, applicationWindow: getApplicationWindowStatus(value), applicationDeadlineExtendedAt: value.applicationDeadlineExtendedAt }, ...publicApplication(record.application, student) }
}

export async function getCompanyDriveApplicantResume(companyUserId, driveId, studentId, dependencies = {}) {
  const record = await getApplicantRecord(companyUserId, driveId, studentId, dependencies)
  if (!record.profile.resume) throw resumeMissing()
  return record.profile.resume
}
