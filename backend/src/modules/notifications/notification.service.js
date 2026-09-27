import { Notification } from './notification.model.js'
import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { Company } from '../companies/company.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { StudentProfile } from '../students/student.model.js'
import { Application } from '../applications/application.model.js'
import { evaluatePlacementDriveEligibility } from '../applications/application.service.js'
import { randomUUID } from 'node:crypto'

export async function createNotifications(notifications, { notificationModel = Notification } = {}) {
  if (!notifications.length) return []
  return notificationModel.create(notifications)
}

function publicNotification(notification) {
  const value = notification.toObject ? notification.toObject() : notification
  return {
    _id: value._id,
    notificationBatchId: value.notificationBatchId,
    category: value.category,
    type: value.type,
    source: value.source,
    title: value.title,
    message: value.message,
    placementDriveId: value.placementDriveId,
    applicationId: value.applicationId,
    companyId: value.companyId,
    phaseNumber: value.phaseNumber,
    context: value.context,
    isRead: value.isRead,
    readAt: value.readAt,
    createdAt: value.createdAt,
  }
}

export async function listNotifications(recipientId, { notificationModel = Notification } = {}) {
  const notifications = await notificationModel.find({ recipientId }).sort({ createdAt: -1 })
  return notifications.map(publicNotification)
}

export async function listSentNotifications(senderId, { notificationModel = Notification } = {}) {
  const notifications = await notificationModel.find({ senderId, category: 'manual_placement_message' }).sort({ createdAt: -1 })
  const batches = new Map()
  for (const notification of notifications) {
    const value = notification.toObject ? notification.toObject() : notification
    // Older deliveries predate batching. Preserve each as its own history entry.
    const key = value.notificationBatchId || `legacy:${value._id}`
    const batch = batches.get(key)
    if (batch) {
      batch.recipientCount += 1
      if (value.isRead) batch.readCount += 1
      else batch.unreadCount += 1
      continue
    }
    batches.set(key, {
      ...publicNotification(value),
      _id: value.notificationBatchId || value._id,
      recipientCount: 1,
      readCount: value.isRead ? 1 : 0,
      unreadCount: value.isRead ? 0 : 1,
    })
  }
  return [...batches.values()]
}

export const listStudentNotifications = (studentId, dependencies) => listNotifications(studentId, dependencies)

export async function markStudentNotificationRead(studentId, notificationId, { notificationModel = Notification, now = new Date() } = {}) {
  const notification = await notificationModel.findOne({ _id: notificationId, recipientId: studentId })
  if (!notification) throw new AppError('Notification was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  if (!notification.isRead) {
    if (typeof notification.set === 'function') notification.set({ isRead: true, readAt: now })
    else Object.assign(notification, { isRead: true, readAt: now })
    await notification.save()
  }
  const value = notification.toObject ? notification.toObject() : notification
  return { _id: value._id, isRead: value.isRead, readAt: value.readAt }
}

const openDriveQuery = id => ({ _id: id, proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })
const missing = message => new AppError(message, { statusCode: 404, errorCode: 'NOT_FOUND' })

async function getPublishedDrive(driveId, { placementDriveModel = PlacementDrive } = {}) {
  const drive = await placementDriveModel.findOne(openDriveQuery(driveId))
  if (!drive) throw missing('Published Placement Drive was not found.')
  return drive
}

async function verifiedStudentIds({ profileModel = StudentProfile } = {}) {
  const profiles = await profileModel.find({ verificationStatus: 'verified' }).select('userId').lean()
  return profiles.map(profile => profile.userId)
}

function eligibilityDependencies(dependencies) {
  const { profileModel = StudentProfile, placementDriveModel = PlacementDrive, studentPolicyStatusService, placementRestrictionService, policyDependencies, restrictionDependencies, now } = dependencies
  return { profileModel, placementDriveModel, ...(studentPolicyStatusService ? { studentPolicyStatusService } : {}), ...(placementRestrictionService ? { placementRestrictionService } : {}), policyDependencies, restrictionDependencies, now }
}

export async function sendAdminStudentNotification(adminId, input, {
  notificationModel = Notification,
  applicationModel = Application,
  eligibilityService = evaluatePlacementDriveEligibility,
  ...dependencies
} = {}) {
  let recipientIds
  let placementDriveId
  if (input.audience === 'all_verified') recipientIds = await verifiedStudentIds(dependencies)
  else {
    const drive = await getPublishedDrive(input.placementDriveId, dependencies)
    placementDriveId = drive._id
    if (input.audience === 'drive_applicants') {
      const applications = await applicationModel.find({ placementDriveId: drive._id, currentStatus: { $ne: 'withdrawn' } }).select('studentId').lean()
      recipientIds = [...new Set(applications.map(application => String(application.studentId)))].map(id => id)
    } else {
      const students = await verifiedStudentIds(dependencies)
      const evaluations = await Promise.all(students.map(async studentId => ({ studentId, result: await eligibilityService(studentId, drive._id, eligibilityDependencies(dependencies)) })))
      recipientIds = evaluations.filter(({ result }) => result.eligible).map(({ studentId }) => studentId)
    }
  }
  const notificationBatchId = randomUUID()
  const notifications = recipientIds.map(recipientId => ({ recipientId, senderId: adminId, notificationBatchId, category: 'manual_placement_message', type: 'admin_to_students', source: 'college', title: input.title, message: input.message, ...(placementDriveId ? { placementDriveId, context: { action: 'view_drive', audience: input.audience } } : {}) }))
  const created = await createNotifications(notifications, { notificationModel })
  return { notificationsCreated: created.length }
}

export async function sendAdminCompanyNotification(adminId, companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, notificationModel = Notification } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw missing('Approved Company account was not found.')
  let placementDriveId
  if (input.placementDriveId) {
    const drive = await placementDriveModel.findOne({ _id: input.placementDriveId, companyId: company._id })
    if (!drive) throw missing('Placement Drive was not found for this Company.')
    placementDriveId = drive._id
  }
  const created = await createNotifications([{ recipientId: companyUserId, senderId: adminId, notificationBatchId: randomUUID(), category: 'manual_placement_message', type: 'admin_to_company', source: 'college', title: input.title, message: input.message, companyId: company._id, ...(placementDriveId ? { placementDriveId, context: { action: 'view_drive', audience: 'company' } } : { context: { action: 'view_company', audience: 'company' } }) }], { notificationModel })
  return { notificationsCreated: created.length }
}

export async function sendCompanyAdminNotification(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, userModel = User, notificationModel = Notification } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can send placement-related messages.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  let placementDriveId
  if (input.placementDriveId) {
    const drive = await placementDriveModel.findOne({ _id: input.placementDriveId, companyId: company._id })
    if (!drive) throw missing('Placement Drive was not found for this Company.')
    placementDriveId = drive._id
  }
  const admin = await userModel.findOne({ role: USER_ROLES.PLACEMENT_ADMIN, isActive: true })
  if (!admin) throw missing('Active Placement Admin account was not found.')
  const created = await createNotifications([{ recipientId: admin._id, senderId: companyUserId, notificationBatchId: randomUUID(), category: 'manual_placement_message', type: 'company_to_admin', source: 'company', title: input.title, message: input.message, companyId: company._id, ...(placementDriveId ? { placementDriveId, context: { action: 'view_drive', audience: 'placement_admin' } } : {}) }], { notificationModel })
  return { notificationsCreated: created.length }
}

export async function sendCompanyDriveApplicantsNotification(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application, notificationModel = Notification } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can notify their Placement Drive applicants.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: input.placementDriveId, companyId: company._id, proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })
  if (!drive) throw missing('Published Placement Drive was not found for this Company.')
  const applications = await applicationModel.find({ placementDriveId: drive._id, currentPhase: 0, currentStatus: { $ne: 'withdrawn' } }).select('studentId').lean()
  const recipientIds = [...new Set(applications.map(application => String(application.studentId)))].map(id => id)
  const notificationBatchId = randomUUID()
  const notifications = recipientIds.map(recipientId => ({ recipientId, senderId: companyUserId, notificationBatchId, category: 'manual_placement_message', type: 'company_to_drive_applicants', source: 'company', title: input.title, message: input.message, placementDriveId: drive._id, companyId: company._id, context: { action: 'view_drive', audience: 'drive_applicants' } }))
  const created = await createNotifications(notifications, { notificationModel })
  return { notificationsCreated: created.length }
}

/**
 * Sends only to candidates who are active at the specified Company-defined
 * phase at send time. The client request id doubles as a notification batch
 * id so an accidental retry remains one send action.
 */
export async function sendCompanyPhaseCandidatesNotification(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application, notificationModel = Notification } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can notify phase candidates.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: input.placementDriveId, companyId: company._id, proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED })
  if (!drive) throw missing('Published Placement Drive was not found for this Company.')
  if (!(drive.phases ?? []).some(phase => phase.phaseNumber === input.phaseNumber)) throw new AppError('The requested Company phase does not exist on this Placement Drive.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })

  const prior = await notificationModel.find({ senderId: companyUserId, idempotencyKey: input.requestId }).select('recipientId').lean()
  if (prior.length) return { notificationsCreated: prior.length, recipientCount: prior.length, alreadySent: true, notificationBatchId: input.requestId }

  const applications = await applicationModel.find({ placementDriveId: drive._id, currentPhase: input.phaseNumber, currentStatus: 'active' }).select('_id studentId').lean()
  const recipients = [...new Map(applications.map(application => [String(application.studentId), application])).values()]
  const notifications = recipients.map(application => ({ recipientId: application.studentId, senderId: companyUserId, notificationBatchId: input.requestId, idempotencyKey: input.requestId, category: 'manual_placement_message', type: 'company_to_phase_candidates', source: 'company', title: input.title, message: input.message, placementDriveId: drive._id, applicationId: application._id, companyId: company._id, phaseNumber: input.phaseNumber, context: { action: 'view_phase', audience: 'phase_candidates', roleTitle: drive.role?.title } }))
  if (!notifications.length) return { notificationsCreated: 0, recipientCount: 0, alreadySent: false, notificationBatchId: input.requestId }
  try {
    const created = await createNotifications(notifications, { notificationModel })
    return { notificationsCreated: created.length, recipientCount: recipients.length, alreadySent: false, notificationBatchId: input.requestId }
  } catch (error) {
    if (error?.code !== 11000) throw error
    const existing = await notificationModel.find({ senderId: companyUserId, idempotencyKey: input.requestId }).select('recipientId').lean()
    return { notificationsCreated: existing.length, recipientCount: existing.length, alreadySent: true, notificationBatchId: input.requestId }
  }
}
