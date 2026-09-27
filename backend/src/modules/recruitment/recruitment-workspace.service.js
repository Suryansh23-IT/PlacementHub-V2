import { readFile, unlink } from 'node:fs/promises'
import { AppError } from '../../errors/app-error.js'
import { Application } from '../applications/application.model.js'
import { Company } from '../companies/company.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { StudentProfile } from '../students/student.model.js'
import { User } from '../auth/auth.model.js'
import { executeCompanyRecruitmentTransition } from './recruitment-transition.service.js'
import { PlacementRecord } from '../placements/placement-record.model.js'

const notFound = message => new AppError(message, { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = message => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })
const invalid = message => new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
function plain(value) { return value?.toObject ? value.toObject() : value }
function assign(document, values) { if (typeof document.set === 'function') document.set(values); else Object.assign(document, values) }

async function orderedFind(model, query, sort) {
  const found = model.find(query)
  if (Array.isArray(found)) return found
  if (typeof found?.sort === 'function') return found.sort(sort)
  return found
}

export async function getCompanyRecruitmentDrive(companyUserId, driveId, { companyModel = Company, placementDriveModel = PlacementDrive, allowInactive = false } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can access recruitment execution.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: driveId, companyId: company._id })
  if (!drive) throw notFound('Placement Drive was not found.')
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED || (!allowInactive && drive.lifecycleStatus !== PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED)) throw conflict('Recruitment execution is available only for published Placement Drives.')
  return { company: plain(company), drive }
}

function publicExecution(entry) {
  if (!entry) return null
  const value = plain(entry)
  const { instructionPdf, ...safe } = value
  if (!instructionPdf) return safe
  const { storagePath, ...pdf } = plain(instructionPdf)
  return { ...safe, instructionPdf: pdf }
}

function publicWorkspaceDrive(drive) {
  const value = plain(drive)
  return { _id: value._id, role: value.role, driveDetails: value.driveDetails, lifecycleStatus: value.lifecycleStatus, phases: value.phases ?? [], phaseExecution: (value.phaseExecution ?? []).map(publicExecution) }
}

async function candidateSummary(application, driveId, { userModel = User, profileModel = StudentProfile, placementRecord } = {}) {
  const value = plain(application)
  const [user, profile] = await Promise.all([userModel.findOne({ _id: value.studentId, role: 'student' }), profileModel.findOne({ userId: value.studentId })])
  if (!user || !profile) return null
  const student = plain(user); const details = plain(profile)
  const resume = details.resume ? (() => { const { storagePath, ...metadata } = plain(details.resume); return { ...metadata, downloadUrl: `/api/v1/companies/me/placement-drives/${driveId}/applicants/${value.studentId}/resume/download` } })() : undefined
  const record = plain(placementRecord)
  const selection = !record ? { state: 'selected_report_not_submitted', label: 'Selected — report not submitted' } : record.verificationState === 'pending_admin_verification' ? { state: 'confirmation_pending', label: 'Confirmation Pending' } : record.verificationState === 'confirmed' ? { state: 'placement_confirmed', label: 'Placement Confirmed' } : { state: record.verificationState, label: record.verificationState === 'revoked' ? 'Placement Revoked' : 'Report Rejected' }
  return { applicationId: value._id, studentId: value.studentId, currentPhase: value.currentPhase, currentStatus: value.currentStatus, appliedAt: value.appliedAt, selection: { ...selection, outcomeType: record?.outcomeType, package: record?.package?.amount, packagePeriod: record?.package?.period, studentReportedAt: record?.studentReportedAt, adminVerifiedAt: record?.adminVerifiedAt }, student: { name: student.name, rollNumber: details.rollNumber, branch: details.branch, cgpa: details.cgpa, activeBacklogs: details.activeBacklogs, graduationYear: details.graduationYear, resume } }
}

export async function getCompanyRecruitmentWorkspace(companyUserId, driveId, dependencies = {}) {
  const { applicationModel = Application, placementRecordModel = null } = dependencies
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, { ...dependencies, allowInactive: true })
  const applications = await orderedFind(applicationModel, { placementDriveId: drive._id }, { appliedAt: -1 })
  const counts = new Map()
  for (const application of applications) {
    const value = plain(application); const key = `${value.currentPhase}:${value.currentStatus}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const phaseCounts = [0, ...(drive.phases ?? []).map(phase => phase.phaseNumber)].map(phaseNumber => ({ phaseNumber, count: applications.filter(application => plain(application).currentPhase === phaseNumber && plain(application).currentStatus !== 'selected_pending_confirmation').length }))
  const records = placementRecordModel ? await orderedFind(placementRecordModel, { placementDriveId: drive._id }, { updatedAt: -1 }) : []; const values = applications.map(plain); const status = name => values.filter(item => item.currentStatus === name).length
  const funnel = { totalApplicants: values.length, activeCandidates: values.filter(item => ['applied', 'active'].includes(item.currentStatus)).length, exitedTotal: values.filter(item => ['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere'].includes(item.currentStatus)).length, phases: [0, ...(drive.phases ?? []).map(phase => phase.phaseNumber)].map(phaseNumber => ({ phaseNumber, count: values.filter(item => item.currentPhase === phaseNumber && ['applied', 'active'].includes(item.currentStatus)).length })), rejected: status('rejected'), absent: status('absent'), withdrawn: status('withdrawn'), closedElsewhere: status('closed_placed_elsewhere'), provisionalSelected: status('selected_pending_confirmation'), confirmationPending: records.filter(record => plain(record).verificationState === 'pending_admin_verification').length, placementConfirmed: records.filter(record => plain(record).verificationState === 'confirmed').length }
  return { drive: publicWorkspaceDrive(drive), phaseCounts, selectedCount: funnel.provisionalSelected, statusCounts: Object.fromEntries(counts), funnel }
}

export async function listCompanyRecruitmentCandidates(companyUserId, driveId, filters = {}, dependencies = {}) {
  const { applicationModel = Application, placementRecordModel = null } = dependencies
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, { ...dependencies, allowInactive: true })
  if (filters.phase != null && filters.phase !== 0 && !(drive.phases ?? []).some(phase => phase.phaseNumber === filters.phase)) throw invalid('The requested Company phase does not exist on this Placement Drive.')
  const selectedPool = filters.status === 'selected_pending_confirmation'
  const query = { placementDriveId: drive._id, ...(filters.phase != null ? { currentPhase: filters.phase } : {}), ...(selectedPool ? { currentStatus: placementRecordModel ? { $in: ['selected_pending_confirmation', 'placement_confirmed'] } : 'selected_pending_confirmation' } : filters.status ? { currentStatus: filters.status } : {}) }
  const applications = await orderedFind(applicationModel, query, { appliedAt: -1 })
  const records = selectedPool && placementRecordModel ? await orderedFind(placementRecordModel, { placementDriveId: drive._id }, { updatedAt: -1 }) : []
  const recordByApplication = new Map(records.map(record => [String(plain(record).applicationId), record]))
  const candidates = (await Promise.all(applications.map(application => candidateSummary(application, drive._id, { ...dependencies, placementRecord: recordByApplication.get(String(plain(application)._id)) })))).filter(Boolean)
  return { drive: publicWorkspaceDrive(drive), filters, candidates }
}

export async function getCompanyPhaseCandidateRecipientCount(companyUserId, driveId, phaseNumber, dependencies = {}) {
  const { applicationModel = Application } = dependencies
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, { ...dependencies, allowInactive: true })
  if (!(drive.phases ?? []).some(phase => phase.phaseNumber === phaseNumber)) throw invalid('The requested Company phase does not exist on this Placement Drive.')
  const recipientCount = typeof applicationModel.countDocuments === 'function'
    ? await applicationModel.countDocuments({ placementDriveId: drive._id, currentPhase: phaseNumber, currentStatus: 'active' })
    : (await orderedFind(applicationModel, { placementDriveId: drive._id, currentPhase: phaseNumber, currentStatus: 'active' }, {})).length
  return { phaseNumber, recipientCount }
}

export async function listCompanyRecruitmentActivity(companyUserId, driveId, dependencies = {}) {
  const { applicationModel = Application, userModel = User, profileModel = StudentProfile, placementRecordModel = null } = dependencies
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, { ...dependencies, allowInactive: true })
  const applications = await orderedFind(applicationModel, { placementDriveId: drive._id }, { appliedAt: -1 })
  const records = placementRecordModel ? await orderedFind(placementRecordModel, { placementDriveId: drive._id }, { updatedAt: -1 }) : []
  const studentCache = new Map()
  const applicationById = new Map(applications.map(application => [String(plain(application)._id), plain(application)]))
  const activity = []
  for (const application of applications) {
    const value = plain(application); const key = String(value.studentId)
    if (!studentCache.has(key)) {
      const [user, profile] = await Promise.all([userModel.findOne({ _id: value.studentId, role: 'student' }), profileModel.findOne({ userId: value.studentId })])
      studentCache.set(key, { name: user?.name, rollNumber: profile?.rollNumber })
    }
    for (const event of value.phaseHistory ?? []) activity.push({ applicationId: value._id, studentId: value.studentId, student: studentCache.get(key), phase: event.phase, status: event.status, action: event.event, at: event.occurredAt })
  }
  for (const record of records) {
    const value = plain(record); const application = applicationById.get(String(value.applicationId)); if (!application) continue
    const key = String(value.studentId)
    if (!studentCache.has(key)) {
      const [user, profile] = await Promise.all([userModel.findOne({ _id: value.studentId, role: 'student' }), profileModel.findOne({ userId: value.studentId })])
      studentCache.set(key, { name: user?.name, rollNumber: profile?.rollNumber })
    }
    for (const event of value.history ?? []) {
      const action = event.event === 'admin_confirmed' ? 'placement_confirmed' : event.event === 'admin_revoked' ? 'placement_revoked' : null
      if (action) activity.push({ applicationId: value.applicationId, studentId: value.studentId, student: studentCache.get(key), phase: application.currentPhase, status: action === 'placement_confirmed' ? 'placement_confirmed' : 'revoked', action, at: event.occurredAt })
    }
  }
  return { events: activity.sort((left, right) => new Date(right.at) - new Date(left.at)) }
}

export async function transitionCompanyRecruitmentCandidate(companyUserId, driveId, applicationId, input, dependencies = {}) {
  return executeCompanyRecruitmentTransition(companyUserId, driveId, applicationId, input, dependencies)
}

export async function bulkTransitionCompanyRecruitmentCandidates(companyUserId, driveId, applicationIds, transition, dependencies = {}) {
  const results = []
  for (const applicationId of applicationIds) {
    try {
      const application = await transitionCompanyRecruitmentCandidate(companyUserId, driveId, applicationId, transition, dependencies)
      results.push({ applicationId, success: true, application: { _id: application._id, currentPhase: application.currentPhase, currentStatus: application.currentStatus } })
    } catch (error) {
      results.push({ applicationId, success: false, error: { message: error.message, errorCode: error.errorCode ?? 'REQUEST_FAILED' } })
    }
  }
  return { results, succeeded: results.filter(result => result.success).length, failed: results.filter(result => !result.success).length }
}

function phaseExecutionFor(drive, phaseNumber) {
  if (!(drive.phases ?? []).some(phase => phase.phaseNumber === phaseNumber)) throw invalid('The requested Company phase does not exist on this Placement Drive.')
  return (drive.phaseExecution ?? []).find(entry => entry.phaseNumber === phaseNumber)
}

export async function updateCompanyPhaseExecution(companyUserId, driveId, phaseNumber, input, dependencies = {}) {
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, dependencies)
  const current = phaseExecutionFor(drive, phaseNumber)
  const next = { ...(plain(current) ?? { phaseNumber, status: 'unscheduled', resources: [] }), ...input, phaseNumber }
  const entries = (drive.phaseExecution ?? []).filter(entry => entry.phaseNumber !== phaseNumber).map(plain)
  entries.push(next); entries.sort((left, right) => left.phaseNumber - right.phaseNumber)
  assign(drive, { phaseExecution: entries })
  const saved = await drive.save()
  return publicExecution((saved.phaseExecution ?? []).find(entry => entry.phaseNumber === phaseNumber))
}

export async function saveCompanyPhaseInstructionPdf(companyUserId, driveId, phaseNumber, file, dependencies = {}) {
  if (!file) throw invalid('Attach an instruction PDF.')
  const bytes = await readFile(file.path).catch(() => null)
  if (!bytes?.subarray(0, 5).equals(Buffer.from('%PDF-'))) { await unlink(file.path).catch(() => {}); throw invalid('The uploaded file is not a valid PDF.') }
  try {
    const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, dependencies)
    const current = phaseExecutionFor(drive, phaseNumber)
    const previous = current?.instructionPdf?.storagePath
    const execution = await updateCompanyPhaseExecution(companyUserId, driveId, phaseNumber, { instructionPdf: { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() } }, dependencies)
    if (previous && previous !== file.path) await unlink(previous).catch(() => {})
    return execution
  } catch (error) { await unlink(file.path).catch(() => {}); throw error }
}

export async function getCompanyPhaseInstructionPdf(companyUserId, driveId, phaseNumber, dependencies = {}) {
  const { drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, dependencies)
  const execution = phaseExecutionFor(drive, phaseNumber)
  if (!execution?.instructionPdf) throw notFound('The phase instruction PDF has not been uploaded.')
  return execution.instructionPdf
}
