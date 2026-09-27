import { AppError } from '../../errors/app-error.js'
import { Company } from '../companies/company.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Application } from './application.model.js'
import { RECRUITMENT_ACTIVE_STATUSES } from './application.constants.js'
import { createPlacementDriveApplication, evaluatePlacementDriveEligibility } from './application.service.js'
import { PlacementRecord } from '../placements/placement-record.model.js'
import { getApplicationWindowStatus } from '../placement-drives/placement-drive.application-window.js'

const notVisible = () => new AppError('Placement Drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const documentMissing = () => new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const phaseAccessUnavailable = () => new AppError('Current phase resources are not available for this application.', { statusCode: 403, errorCode: 'FORBIDDEN' })
const openQuery = () => ({ proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })
const historicalJourneyQuery = () => ({ proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: { $in: [PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.CANCELLED] } })

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
  return createPlacementDriveApplication(studentId, driveId, { ...dependencies, enforceConfirmedPlacementLock: Boolean(dependencies.enforceConfirmedPlacementLock), placementRecordModel: dependencies.placementRecordModel ?? (dependencies.enforceConfirmedPlacementLock ? PlacementRecord : null) })
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

function publicCurrentPhaseExecution(execution, driveId, applicationId) {
  const value = plain(execution)
  const { instructionPdf, ...safe } = value
  return {
    ...safe,
    ...(instructionPdf ? { instructionPdf: { originalName: instructionPdf.originalName, mimeType: instructionPdf.mimeType, size: instructionPdf.size, uploadedAt: instructionPdf.uploadedAt, downloadUrl: `/api/v1/students/me/applications/${applicationId}/current-phase/instruction-pdf/download` } } : {}),
    placementDriveId: driveId,
  }
}

async function getStudentCurrentPhase(studentId, applicationId, { applicationModel = Application, placementDriveModel = PlacementDrive } = {}) {
  const application = await applicationModel.findOne({ _id: applicationId, studentId })
  if (!application) throw new AppError('Application was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  const value = plain(application)
  if (value.currentPhase < 1 || ![...RECRUITMENT_ACTIVE_STATUSES, 'selected_pending_confirmation'].includes(value.currentStatus)) throw phaseAccessUnavailable()
  const drive = await placementDriveModel.findOne({ _id: value.placementDriveId, ...openQuery() })
  if (!drive) throw notVisible()
  const phase = (drive.phases ?? []).find(item => item.phaseNumber === value.currentPhase)
  if (!phase) throw phaseAccessUnavailable()
  const execution = (drive.phaseExecution ?? []).find(item => item.phaseNumber === value.currentPhase)
  return { application: value, drive, phase, execution }
}

export async function getStudentCurrentPhaseExecution(studentId, applicationId, dependencies = {}) {
  const { application, drive, phase, execution } = await getStudentCurrentPhase(studentId, applicationId, dependencies)
  return { applicationId: application._id, placementDriveId: drive._id, role: drive.role, phase: { phaseNumber: phase.phaseNumber, title: phase.title, type: phase.type, description: phase.description }, execution: execution ? publicCurrentPhaseExecution(execution, drive._id, application._id) : null }
}

export async function getStudentCurrentPhaseInstructionPdf(studentId, applicationId, dependencies = {}) {
  const { execution } = await getStudentCurrentPhase(studentId, applicationId, dependencies)
  if (!execution?.instructionPdf) throw new AppError('The current phase instruction PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return execution.instructionPdf
}

function publicPhaseHistory(history = []) {
  return history.map(entry => ({ phase: entry.phase, status: entry.status, event: entry.event, occurredAt: entry.occurredAt }))
}

export async function getStudentRecruitmentJourney(studentId, applicationId, dependencies = {}) {
  const { applicationModel = Application, placementDriveModel = PlacementDrive, companyModel = Company, placementRecordModel = null } = dependencies
  const application = await applicationModel.findOne({ _id: applicationId, studentId })
  if (!application) throw new AppError('Application was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  const value = plain(application)
  const drive = await placementDriveModel.findOne({ _id: value.placementDriveId, ...historicalJourneyQuery() })
  if (!drive) throw notVisible()
  const company = await getCompanySummary(drive.companyId, { companyModel })
  const canReadCurrentPhase = drive.lifecycleStatus === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED && value.currentPhase >= 1 && [...RECRUITMENT_ACTIVE_STATUSES, 'selected_pending_confirmation'].includes(value.currentStatus)
  const currentPhase = (drive.phases ?? []).find(phase => phase.phaseNumber === value.currentPhase)
  const execution = canReadCurrentPhase ? (drive.phaseExecution ?? []).find(item => item.phaseNumber === value.currentPhase) : null
  const placementRecord = placementRecordModel ? await placementRecordModel.findOne({ applicationId: value._id, studentId }) : null
  const outcome = placementRecord?.verificationState === 'confirmed' ? placementRecord : null
  return {
    application: { _id: value._id, placementDriveId: value.placementDriveId, appliedAt: value.appliedAt, updatedAt: value.updatedAt, withdrawnAt: value.withdrawnAt, currentPhase: value.currentPhase, currentStatus: value.currentStatus, phaseHistory: publicPhaseHistory(value.phaseHistory) },
    drive: { _id: drive._id, company, role: drive.role, lifecycleStatus: drive.lifecycleStatus, driveDetails: { workLocation: drive.driveDetails?.workLocation, workMode: drive.driveDetails?.workMode, joiningPeriod: drive.driveDetails?.joiningPeriod } },
    phases: (drive.phases ?? []).map(phase => ({ phaseNumber: phase.phaseNumber, title: phase.title, type: phase.type, description: phase.description })),
    currentPhase: currentPhase ? { phaseNumber: currentPhase.phaseNumber, title: currentPhase.title, type: currentPhase.type, description: currentPhase.description } : null,
    currentPhaseExecution: execution ? publicCurrentPhaseExecution(execution, drive._id, value._id) : null,
    placementReportState: value.currentStatus === 'selected_pending_confirmation' && placementRecord?.verificationState === 'pending_admin_verification' ? 'pending_admin_verification' : null,
    confirmedOutcome: outcome ? { outcomeType: outcome.outcomeType, package: outcome.package, stipend: outcome.stipend, location: outcome.location, joiningPeriod: outcome.joiningPeriod, companySelectedAt: outcome.companySelectedAt, adminVerifiedAt: outcome.adminVerifiedAt } : null,
  }
}
