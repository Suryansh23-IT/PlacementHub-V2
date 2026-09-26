import { AppError } from '../../errors/app-error.js'
import { Company } from '../companies/company.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Application } from './application.model.js'
import { createPlacementDriveApplication, evaluatePlacementDriveEligibility } from './application.service.js'
import { getApplicationWindowStatus } from '../placement-drives/placement-drive.application-window.js'

const notVisible = () => new AppError('Placement Drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const documentMissing = () => new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const openQuery = () => ({ proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })

function plain(value) { return value?.toObject ? value.toObject() : value }

function publicDocument(document, downloadUrl) {
  if (!document) return undefined
  const { storagePath, ...metadata } = plain(document)
  return { ...metadata, downloadUrl }
}

async function getCompanySummary(companyId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ _id: companyId }).select('companyName industry location website officialEmail recruiterName recruiterDesignation recruiterEmail recruiterPhone')
  if (!company) return null
  const value = plain(company)
  return {
    companyName: value.companyName,
    industry: value.industry,
    location: value.location,
    website: value.website,
    officialEmail: value.officialEmail,
    recruiter: { name: value.recruiterName, designation: value.recruiterDesignation, email: value.recruiterEmail, phone: value.recruiterPhone },
  }
}

function publicDrive(drive, company, { detail = false, eligibility, application } = {}) {
  const value = plain(drive)
  const base = {
    _id: value._id,
    company,
    role: value.role,
    driveDetails: value.driveDetails,
    applicationDeadline: value.driveDetails?.applicationDeadline,
    applicationWindow: getApplicationWindowStatus(value),
    applicationDeadlineExtendedAt: value.applicationDeadlineExtendedAt,
    eligibilityResult: eligibility,
    hasApplied: Boolean(application),
    application: application ? { _id: application._id, currentPhase: application.currentPhase, currentStatus: application.currentStatus, withdrawnAt: application.withdrawnAt } : null,
  }
  if (!detail) return base
  return {
    ...base,
    eligibility: value.eligibility,
    phases: value.phases ?? [],
    documents: {
      companyRecruitmentInformation: publicDocument(value.documents?.companyRecruitmentInformation, `/api/v1/students/me/placement-drives/${value._id}/documents/companyRecruitmentInformation/download`),
      placementDriveJobDescription: publicDocument(value.documents?.placementDriveJobDescription, `/api/v1/students/me/placement-drives/${value._id}/documents/placementDriveJobDescription/download`),
    },
  }
}

function eligibilityDependencies(dependencies) {
  const { profileModel = StudentProfile, placementDriveModel = PlacementDrive, studentPolicyStatusService, placementRestrictionService, policyDependencies, restrictionDependencies, now } = dependencies
  return { profileModel, placementDriveModel, ...(studentPolicyStatusService ? { studentPolicyStatusService } : {}), ...(placementRestrictionService ? { placementRestrictionService } : {}), policyDependencies, restrictionDependencies, now }
}

export async function getStudentVisiblePlacementDrive(driveId, { placementDriveModel = PlacementDrive } = {}) {
  const drive = await placementDriveModel.findOne({ _id: driveId, ...openQuery() })
  if (!drive) throw notVisible()
  return drive
}

export async function listStudentPlacementDrives(studentId, dependencies = {}) {
  const { placementDriveModel = PlacementDrive, applicationModel = Application, companyModel = Company } = dependencies
  const drives = await placementDriveModel.find(openQuery()).sort({ 'driveDetails.applicationDeadline': 1 })
  return Promise.all(drives.map(async drive => {
    const [eligibility, application, company] = await Promise.all([
      evaluatePlacementDriveEligibility(studentId, drive._id, eligibilityDependencies(dependencies)),
      applicationModel.findOne({ studentId, placementDriveId: drive._id }),
      getCompanySummary(drive.companyId, { companyModel }),
    ])
    return publicDrive(drive, company, { eligibility, application })
  }))
}

export async function getStudentPlacementDriveDetail(studentId, driveId, dependencies = {}) {
  const { applicationModel = Application, companyModel = Company } = dependencies
  const drive = await getStudentVisiblePlacementDrive(driveId, dependencies)
  const [eligibility, application, company] = await Promise.all([
    evaluatePlacementDriveEligibility(studentId, drive._id, eligibilityDependencies(dependencies)),
    applicationModel.findOne({ studentId, placementDriveId: drive._id }),
    getCompanySummary(drive.companyId, { companyModel }),
  ])
  return publicDrive(drive, company, { detail: true, eligibility, application })
}

export async function applyToStudentPlacementDrive(studentId, driveId, dependencies = {}) {
  await getStudentVisiblePlacementDrive(driveId, dependencies)
  return createPlacementDriveApplication(studentId, driveId, dependencies)
}

export async function getStudentPlacementDriveDocument(studentId, driveId, type, dependencies = {}) {
  const drive = await getStudentVisiblePlacementDrive(driveId, dependencies)
  const document = drive.documents?.[type]
  if (!document) throw documentMissing()
  return document
}

export async function listMyPlacementApplications(studentId, { applicationModel = Application, placementDriveModel = PlacementDrive, companyModel = Company } = {}) {
  const applications = await applicationModel.find({ studentId }).sort({ appliedAt: -1 })
  return Promise.all(applications.map(async application => {
    const value = plain(application)
    const drive = await placementDriveModel.findOne({ _id: value.placementDriveId })
    const company = drive ? await getCompanySummary(drive.companyId, { companyModel }) : null
    return {
      _id: value._id,
      placementDriveId: value.placementDriveId,
      appliedAt: value.appliedAt,
      currentPhase: value.currentPhase,
      currentStatus: value.currentStatus,
      withdrawnAt: value.withdrawnAt,
      phaseHistory: value.phaseHistory,
      drive: drive ? { _id: drive._id, company, role: drive.role, driveDetails: drive.driveDetails } : null,
    }
  }))
}
