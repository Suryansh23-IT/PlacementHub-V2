import { readFile, unlink } from 'node:fs/promises'
import { AppError } from '../../errors/app-error.js'
import { evaluatePlacementDriveEligibility } from '../applications/application.service.js'
import { Application } from '../applications/application.model.js'
import { RECRUITMENT_ACTIVE_STATUSES } from '../applications/application.constants.js'
import { Company } from '../companies/company.model.js'
import { getInstitutionProfile } from '../institution/institution.service.js'
import { Notification } from '../notifications/notification.model.js'
import { createNotifications } from '../notifications/notification.service.js'
import { getRecruiterPolicyStatus } from '../recruiter-policy/recruiter-policy.service.js'
import { StudentProfile } from '../students/student.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from './placement-drive.constants.js'
import { PlacementDrive } from './placement-drive.model.js'
import { placementDriveSubmissionSchema } from './placement-drive.validation.js'
import { getApplicationWindowStatus } from './placement-drive.application-window.js'

const notFound = () => new AppError('Placement Drive proposal was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = (message) => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })

export async function getPlacementDriveBranches({ institutionService = getInstitutionProfile } = {}) {
  const institution = await institutionService()
  return institution.branches ?? []
}

async function assertKnownEligibilityBranches(input, { institutionService = getInstitutionProfile } = {}) {
  const branches = await getPlacementDriveBranches({ institutionService })
  const knownBranches = new Set(branches)
  const unknown = input.eligibility.allowedBranches.find(branch => !knownBranches.has(branch))
  if (unknown) throw new AppError('Select only branches configured by the Placement Admin.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
}

export async function getApprovedCompanyForDrive(companyUserId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' }).select('_id')
  if (!company) throw new AppError('Only approved companies can create Placement Drive proposals.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  return company
}

export async function createPlacementDriveDraft(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, institutionService = getInstitutionProfile } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  await assertKnownEligibilityBranches(input, { institutionService })
  return placementDriveModel.create({
    ...input,
    companyId: company._id,
    proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT,
    lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.UNPUBLISHED,
  })
}

export async function listMyPlacementDrives(companyUserId, { companyModel = Company, placementDriveModel = PlacementDrive } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  return placementDriveModel.find({ companyId: company._id }).sort({ updatedAt: -1 })
}

export async function getMyPlacementDrive(companyUserId, driveId, { companyModel = Company, placementDriveModel = PlacementDrive } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  const drive = await placementDriveModel.findOne({ _id: driveId, companyId: company._id })
  if (!drive) throw notFound()
  return drive
}

function requireEditable(drive) {
  if (![PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT, PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED].includes(drive.proposalStatus)) {
    throw conflict('Only draft or changes-requested Placement Drive proposals can be edited.')
  }
}

function assignDrive(drive, input) {
  if (typeof drive.set === 'function') drive.set(input)
  else Object.assign(drive, input)
}

export async function updateMyPlacementDrive(companyUserId, driveId, input, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  requireEditable(drive)
  await assertKnownEligibilityBranches(input, dependencies)
  assignDrive(drive, input)
  return drive.save()
}

export async function saveMyPlacementDriveDocument(companyUserId, driveId, type, file, dependencies = {}) {
  if (!file) throw new AppError('Attach a PDF document.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const bytes = await readFile(file.path).catch(() => null)
  if (!bytes?.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    await unlink(file.path).catch(() => {})
    throw new AppError('The uploaded file is not a valid PDF.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  try {
    requireEditable(drive)
    const previous = drive.documents?.[type]?.storagePath
    const metadata = { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() }
    if (typeof drive.set === 'function') drive.set(`documents.${type}`, metadata)
    else { drive.documents ??= {}; drive.documents[type] = metadata }
    const saved = await drive.save()
    if (previous && previous !== file.path) await unlink(previous).catch(() => {})
    return saved
  } catch (error) {
    await unlink(file.path).catch(() => {})
    throw error
  }
}

export async function getMyPlacementDriveDocument(companyUserId, driveId, type, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  const document = drive.documents?.[type]
  if (!document) throw new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return document
}

async function requireCurrentRecruiterPolicyAcceptance(companyUserId, policyDependencies) {
  const { policy, acceptance } = await getRecruiterPolicyStatus(companyUserId, policyDependencies)
  if (!policy || !acceptance) throw new AppError('Accept the active Recruiter Placement Policy before submitting a Placement Drive proposal.', { statusCode: 403, errorCode: 'FORBIDDEN' })
}

function assertReadyForSubmission(drive) {
  const value = drive.toObject ? drive.toObject() : drive
  const parsed = placementDriveSubmissionSchema.safeParse(value)
  if (!parsed.success) throw conflict('Complete the structured proposal details and upload both required PDFs before submitting.')
}

async function submit(companyUserId, driveId, allowedStatus, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  if (drive.proposalStatus !== allowedStatus) throw conflict(allowedStatus === PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT ? 'Only draft Placement Drive proposals can be submitted.' : 'Only changes-requested Placement Drive proposals can be resubmitted.')
  await assertKnownEligibilityBranches(drive.toObject ? drive.toObject() : drive, dependencies)
  await requireCurrentRecruiterPolicyAcceptance(companyUserId, dependencies.policyDependencies)
  assertReadyForSubmission(drive)
  assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.SUBMITTED, review: {} })
  return drive.save()
}

export const submitMyPlacementDrive = (companyUserId, driveId, dependencies) => submit(companyUserId, driveId, PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT, dependencies)
export const resubmitMyPlacementDrive = (companyUserId, driveId, dependencies) => submit(companyUserId, driveId, PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED, dependencies)

export async function listPlacementDriveProposals({ placementDriveModel = PlacementDrive } = {}) {
  return placementDriveModel.find({}).sort({ updatedAt: -1 })
}

export async function getPlacementDriveProposal(driveId, { placementDriveModel = PlacementDrive } = {}) {
  const drive = await placementDriveModel.findOne({ _id: driveId })
  if (!drive) throw notFound()
  return drive
}

export async function reviewPlacementDriveProposal(driveId, adminId, input, dependencies = {}) {
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.SUBMITTED) throw conflict('Only submitted Placement Drive proposals can be reviewed.')
  const review = { reviewedBy: adminId, reviewedAt: new Date() }
  if (input.decision === PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED) {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, review })
  } else if (input.decision === PLACEMENT_DRIVE_PROPOSAL_STATUSES.REJECTED) {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.REJECTED, review: { ...review, rejectionReason: input.reason } })
  } else {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED, review: { ...review, requestedChanges: input.reason } })
  }
  return drive.save()
}

async function listVerifiedStudentIds(profileModel) {
  const profiles = await profileModel.find({ verificationStatus: 'verified' }).select('userId').lean()
  return profiles.map(profile => profile.userId)
}

export async function publishPlacementDriveProposal(driveId, adminId, {
  placementDriveModel = PlacementDrive,
  profileModel = StudentProfile,
  notificationModel = Notification,
  notificationService = createNotifications,
  eligibilityService = evaluatePlacementDriveEligibility,
  studentPolicyStatusService,
  placementRestrictionService,
  policyDependencies,
  restrictionDependencies,
  now = new Date(),
} = {}) {
  const drive = await getPlacementDriveProposal(driveId, { placementDriveModel })
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED) throw conflict('Only approved Placement Drive proposals can be published.')
  if (drive.lifecycleStatus === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED) return { drive, notificationsCreated: 0, alreadyPublished: true }
  if (drive.lifecycleStatus !== PLACEMENT_DRIVE_LIFECYCLE_STATUSES.UNPUBLISHED) throw conflict('Only unpublished approved Placement Drive proposals can be published.')

  assignDrive(drive, { lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED, publishedAt: now })
  const publishedDrive = await drive.save()
  const studentIds = await listVerifiedStudentIds(profileModel)
  const eligibilityDependencies = { profileModel, placementDriveModel, ...(studentPolicyStatusService ? { studentPolicyStatusService } : {}), ...(placementRestrictionService ? { placementRestrictionService } : {}), policyDependencies, restrictionDependencies, now }
  const evaluations = await Promise.all(studentIds.map(async studentId => ({ studentId, result: await eligibilityService(studentId, publishedDrive._id, eligibilityDependencies) })))
  const recipients = evaluations.filter(({ result }) => result.eligible).map(({ studentId }) => studentId)
  const role = publishedDrive.role?.title || 'a Placement Drive'
  const notifications = recipients.map(recipientId => ({
    recipientId,
    senderId: adminId,
    category: 'placement_drive',
    type: 'placement_drive_published',
    source: 'placement_system',
    title: 'New Placement Drive open',
    message: `${role} is now open for applications.`,
    placementDriveId: publishedDrive._id,
    ...(publishedDrive.companyId ? { companyId: publishedDrive.companyId } : {}),
    context: { action: 'view_drive', audience: 'eligible_students' },
  }))
  const created = await notificationService(notifications, { notificationModel })
  return { drive: publishedDrive, notificationsCreated: created.length, alreadyPublished: false }
}

const applicationWindowNotPublished = () => new AppError('Only published Placement Drives can have their application window managed.', { statusCode: 409, errorCode: 'CONFLICT' })
const futureDeadlineRequired = () => new AppError('Provide a future application deadline.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })

function assertPublishedForApplicationWindow(drive) {
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED || drive.lifecycleStatus !== PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED) throw applicationWindowNotPublished()
}

function assertFutureDeadline(deadline, now) {
  if (!deadline || new Date(deadline).getTime() <= new Date(now).getTime()) throw futureDeadlineRequired()
}

async function applicationWindowRecipients(drive, audience, dependencies) {
  if (audience === 'drive_applicants') {
    const applicationModel = dependencies.applicationModel ?? Application
    const applications = await applicationModel.find({ placementDriveId: drive._id, currentStatus: { $ne: 'withdrawn' } }).select('studentId').lean()
    return [...new Set(applications.map(application => String(application.studentId)))]
  }
  const studentIds = await listVerifiedStudentIds(dependencies.profileModel ?? StudentProfile)
  const evaluations = await Promise.all(studentIds.map(async studentId => ({
    studentId,
    result: await (dependencies.eligibilityService ?? evaluatePlacementDriveEligibility)(studentId, drive._id, {
      profileModel: dependencies.profileModel ?? StudentProfile,
      placementDriveModel: dependencies.placementDriveModel ?? PlacementDrive,
      ...(dependencies.studentPolicyStatusService ? { studentPolicyStatusService: dependencies.studentPolicyStatusService } : {}),
      ...(dependencies.placementRestrictionService ? { placementRestrictionService: dependencies.placementRestrictionService } : {}),
      policyDependencies: dependencies.policyDependencies,
      restrictionDependencies: dependencies.restrictionDependencies,
      now: dependencies.now,
    }),
  })))
  return evaluations.filter(({ result }) => result.eligible).map(({ studentId }) => studentId)
}

async function notifyApplicationWindowChange(drive, adminId, kind, dependencies) {
  const messages = {
    deadline_extended: { audience: 'eligible_students', type: 'application_deadline_extended', title: 'Application deadline extended', message: `${drive.role?.title || 'This Placement Drive'} now accepts applications until ${new Date(drive.driveDetails.applicationDeadline).toLocaleDateString('en-IN')}.` },
    manually_closed: { audience: 'drive_applicants', type: 'applications_manually_closed', title: 'Applications closed', message: `Applications for ${drive.role?.title || 'this Placement Drive'} were closed by Placement Administration. Your existing application remains active.` },
    reopened: { audience: 'eligible_students', type: 'applications_reopened', title: 'Applications reopened', message: `${drive.role?.title || 'This Placement Drive'} is open for applications until ${new Date(drive.driveDetails.applicationDeadline).toLocaleDateString('en-IN')}.` },
  }
  const event = messages[kind]
  const recipientIds = await applicationWindowRecipients(drive, event.audience, dependencies)
  const notifications = recipientIds.map(recipientId => ({ recipientId, senderId: adminId, category: 'placement_drive', type: event.type, source: 'placement_system', title: event.title, message: event.message, placementDriveId: drive._id, companyId: drive.companyId, context: { action: 'view_drive', audience: event.audience } }))
  const created = await (dependencies.notificationService ?? createNotifications)(notifications, { notificationModel: dependencies.notificationModel ?? Notification })
  return created.length
}

export async function extendPlacementDriveApplicationDeadline(driveId, adminId, input, dependencies = {}) {
  const now = dependencies.now ?? new Date()
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  assertPublishedForApplicationWindow(drive)
  const nextDeadline = new Date(input.applicationDeadline)
  assertFutureDeadline(nextDeadline, now)
  if (nextDeadline.getTime() <= new Date(drive.driveDetails.applicationDeadline).getTime()) throw new AppError('The new application deadline must be later than the current deadline.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  assignDrive(drive, { driveDetails: { ...(drive.driveDetails?.toObject ? drive.driveDetails.toObject() : drive.driveDetails), applicationDeadline: nextDeadline }, applicationDeadlineExtendedAt: now, applicationDeadlineExtendedBy: adminId })
  const saved = await drive.save()
  const notificationsCreated = await notifyApplicationWindowChange(saved, adminId, 'deadline_extended', { ...dependencies, now })
  return { drive: saved, notificationsCreated, applicationWindow: getApplicationWindowStatus(saved, now) }
}

export async function closePlacementDriveApplications(driveId, adminId, dependencies = {}) {
  const now = dependencies.now ?? new Date()
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  assertPublishedForApplicationWindow(drive)
  if (drive.applicationsManuallyClosedAt) return { drive, notificationsCreated: 0, alreadyClosed: true, applicationWindow: getApplicationWindowStatus(drive, now) }
  assignDrive(drive, { applicationsManuallyClosedAt: now, applicationsManuallyClosedBy: adminId })
  const saved = await drive.save()
  const notificationsCreated = await notifyApplicationWindowChange(saved, adminId, 'manually_closed', { ...dependencies, now })
  return { drive: saved, notificationsCreated, alreadyClosed: false, applicationWindow: getApplicationWindowStatus(saved, now) }
}

export async function reopenPlacementDriveApplications(driveId, adminId, input, dependencies = {}) {
  const now = dependencies.now ?? new Date()
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  assertPublishedForApplicationWindow(drive)
  if (!drive.applicationsManuallyClosedAt) return { drive, notificationsCreated: 0, alreadyOpen: true, applicationWindow: getApplicationWindowStatus(drive, now) }
  const currentDeadline = new Date(drive.driveDetails.applicationDeadline)
  const nextDeadline = input.applicationDeadline ? new Date(input.applicationDeadline) : null
  if (currentDeadline.getTime() <= new Date(now).getTime() && !nextDeadline) throw futureDeadlineRequired()
  if (nextDeadline) {
    assertFutureDeadline(nextDeadline, now)
    if (nextDeadline.getTime() <= currentDeadline.getTime()) throw new AppError('The new application deadline must be later than the current deadline.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }
  assignDrive(drive, { applicationsManuallyClosedAt: undefined, applicationsManuallyClosedBy: undefined, ...(nextDeadline ? { driveDetails: { ...(drive.driveDetails?.toObject ? drive.driveDetails.toObject() : drive.driveDetails), applicationDeadline: nextDeadline }, applicationDeadlineExtendedAt: now, applicationDeadlineExtendedBy: adminId } : {}) })
  const saved = await drive.save()
  const notificationsCreated = await notifyApplicationWindowChange(saved, adminId, 'reopened', { ...dependencies, now })
  return { drive: saved, notificationsCreated, alreadyOpen: false, applicationWindow: getApplicationWindowStatus(saved, now) }
}

async function ensureLifecycleNotifications(drive, adminId, status, dependencies = {}) {
  const applicationModel = dependencies.applicationModel ?? Application
  const notificationModel = dependencies.notificationModel ?? Notification
  const applications = await applicationModel.find({ placementDriveId: drive._id, currentStatus: { $in: [...RECRUITMENT_ACTIVE_STATUSES, 'selected_pending_confirmation'] } }).select('_id studentId').lean()
  const idempotencyKey = `drive-lifecycle:${status}:${drive._id}`
  const existing = await notificationModel.find({ idempotencyKey }).select('recipientId').lean()
  const existingRecipients = new Set(existing.map(item => String(item.recipientId)))
  const type = status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED ? 'placement_drive_postponed' : status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED ? 'placement_drive_closed' : 'placement_drive_cancelled'
  const title = status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED ? 'Placement Drive postponed' : status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED ? 'Placement Drive closed' : 'Placement Drive cancelled'
  const message = status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED
    ? `${drive.role?.title || 'This Placement Drive'} has been postponed by Placement Administration. Your application and recruitment history are preserved.`
    : status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED
      ? `${drive.role?.title || 'This Placement Drive'} has been closed by Placement Administration. Your application and recruitment history remain available.`
      : `${drive.role?.title || 'This Placement Drive'} has been cancelled by Placement Administration. Your application and recruitment history remain available.`
  const pending = applications.filter(item => !existingRecipients.has(String(item.studentId))).map(item => ({
    recipientId: item.studentId, senderId: adminId, idempotencyKey, notificationBatchId: idempotencyKey,
    category: 'placement_drive', type, source: 'placement_system', title, message,
    placementDriveId: drive._id, applicationId: item._id, companyId: drive.companyId,
    context: { action: 'view_application', audience: 'student', roleTitle: drive.role?.title },
  }))
  const created = await (dependencies.notificationService ?? createNotifications)(pending, { notificationModel })
  return created.length
}

async function changePlacementDriveLifecycle(driveId, adminId, status, reason, dependencies = {}) {
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED) throw conflict('Only an approved Placement Drive can receive a recruitment lifecycle action.')
  if (drive.lifecycleStatus === status) {
    const notificationsCreated = await ensureLifecycleNotifications(drive, adminId, status, dependencies)
    return { drive, notificationsCreated, alreadyChanged: true }
  }
  const allowed = status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED
    ? [PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED]
    : status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED
      ? [PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED]
      : [PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED]
  if (!allowed.includes(drive.lifecycleStatus)) throw conflict(status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED ? 'Only a published Placement Drive can be postponed.' : status === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED ? 'Only a published Placement Drive can be closed.' : 'Only a published or postponed Placement Drive can be cancelled.')
  const now = new Date(dependencies.now ?? Date.now())
  assignDrive(drive, { lifecycleStatus: status, lifecycleHistory: [...(drive.lifecycleHistory ?? []), { event: status, status, reason, actorId: adminId, occurredAt: now }] })
  const saved = await drive.save()
  const notificationsCreated = await ensureLifecycleNotifications(saved, adminId, status, dependencies)
  return { drive: saved, notificationsCreated, alreadyChanged: false }
}

export const postponePlacementDrive = (driveId, adminId, reason, dependencies) => changePlacementDriveLifecycle(driveId, adminId, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.POSTPONED, reason, dependencies)
export const completePlacementDrive = (driveId, adminId, reason, dependencies) => changePlacementDriveLifecycle(driveId, adminId, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.COMPLETED, reason, dependencies)
export const cancelPlacementDrive = (driveId, adminId, reason, dependencies) => changePlacementDriveLifecycle(driveId, adminId, PLACEMENT_DRIVE_LIFECYCLE_STATUSES.CANCELLED, reason, dependencies)

export async function getPlacementDriveDocumentForAdmin(driveId, type, dependencies = {}) {
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  const document = drive.documents?.[type]
  if (!document) throw new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return document
}
