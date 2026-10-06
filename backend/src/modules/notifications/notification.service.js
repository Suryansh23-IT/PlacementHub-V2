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
import { previewStudentExplorerNotification, sendStudentExplorerNotification } from '../students/student.service.js'

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

const categoryGroup = notification => notification.category?.includes('placement') || notification.type?.includes('placement') ? 'placement' : notification.placementDriveId || notification.phaseNumber || notification.source === 'company' ? 'recruitment' : 'system'
export async function listNotificationPage(recipientId, filters = {}, { notificationModel = Notification } = {}) {
  const query = { recipientId, ...(filters.state === 'unread' ? { isRead: false } : filters.state === 'read' ? { isRead: true } : {}) }
  const all = (await notificationModel.find(query).sort({ createdAt: -1 })).map(publicNotification)
  const searched = all.filter(item => (!filters.search || [item.title, item.message, item.context?.phaseTitle, item.context?.roleTitle].filter(Boolean).join(' ').toLowerCase().includes(filters.search.toLowerCase())) && (filters.category === 'all' || categoryGroup(item) === filters.category))
  const page = filters.page ?? 1; const limit = filters.limit ?? 25; const start = (page - 1) * limit
  return { records: searched.slice(start, start + limit), page, limit, totalRecords: searched.length, totalPages: Math.max(1, Math.ceil(searched.length / limit)), unreadCount: all.filter(item => !item.isRead).length }
}

export async function markAllNotificationsRead(recipientId, { notificationModel = Notification, now = new Date() } = {}) {
  const result = await notificationModel.updateMany({ recipientId, isRead: false }, { $set: { isRead: true, readAt: now } })
  return { updated: result.modifiedCount ?? result.nModified ?? 0 }
}

export const previewAdminExplorerNotification = (input, dependencies) => previewStudentExplorerNotification(input, dependencies)
export const sendAdminExplorerNotification = (adminId, input, dependencies) => sendStudentExplorerNotification(adminId, input, dependencies)

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

export async function listSentNotificationPage(senderId, filters = {}, { notificationModel = Notification } = {}) {
  const sent = await listSentNotifications(senderId, { notificationModel }); const term = filters.search?.toLowerCase(); const start = filters.dateFrom ? new Date(filters.dateFrom) : null; const end = filters.dateTo ? new Date(filters.dateTo) : null; if (start) start.setHours(0, 0, 0, 0); if (end) end.setHours(23, 59, 59, 999); const rows = sent.filter(item => (filters.category === 'all' || !filters.category || item.category === filters.category) && (!filters.drive || String(item.placementDriveId) === String(filters.drive)) && (!filters.phase || Number(item.phaseNumber) === Number(filters.phase)) && (!filters.targetType || item.context?.audience === filters.targetType) && (!start || new Date(item.createdAt) >= start) && (!end || new Date(item.createdAt) <= end) && (!term || `${item.title} ${item.message}`.toLowerCase().includes(term))).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)); const page = filters.page ?? 1; const limit = filters.limit ?? 25; return { records: rows.slice((page - 1) * limit, page * limit), page, limit, totalRecords: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) }
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
  const phase = drive.phases.find(item => item.phaseNumber === input.phaseNumber)
  const notifications = recipients.map(application => ({ recipientId: application.studentId, senderId: companyUserId, notificationBatchId: input.requestId, idempotencyKey: input.requestId, category: 'manual_placement_message', type: 'company_to_phase_candidates', source: 'company', title: input.title, message: input.message, placementDriveId: drive._id, applicationId: application._id, companyId: company._id, phaseNumber: input.phaseNumber, context: { action: 'view_phase', audience: 'phase_candidates', roleTitle: drive.role?.title, phaseTitle: phase?.title } }))
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

async function resolveCompanyTarget(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application, userModel = User, profileModel = StudentProfile } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' }); if (!company) throw new AppError('Only approved Companies can notify candidates.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: input.placementDriveId, companyId: company._id }); if (!drive) throw missing('Placement Drive was not found for this Company.')
  const query = { placementDriveId: drive._id, ...(input.target === 'active' ? { currentStatus: 'active' } : input.target === 'phase' ? { currentStatus: 'active', currentPhase: input.phaseNumber } : input.target === 'selected' ? { currentStatus: { $in: ['selected_pending_confirmation', 'placement_confirmed'] } } : input.target === 'specific' ? { _id: { $in: input.selectedApplicationIds } } : {}) }
  const applications = await applicationModel.find(query).select('_id studentId currentPhase').lean(); if (input.target === 'specific' && applications.length !== new Set(input.selectedApplicationIds).size) throw new AppError('One or more candidates are not part of this Company drive.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const studentIds = [...new Set(applications.map(application => String(application.studentId)))]
  const [users, profiles] = await Promise.all([
    userModel.find({ _id: { $in: studentIds }, role: USER_ROLES.STUDENT }).select('_id name').lean(),
    profileModel.find({ userId: { $in: studentIds } }).select('userId rollNumber branch').lean(),
  ])
  const usersById = new Map(users.map(user => [String(user._id), user]))
  const profilesByUserId = new Map(profiles.map(profile => [String(profile.userId), profile]))
  const previewRecipients = applications.map(application => {
    const user = usersById.get(String(application.studentId)); const profile = profilesByUserId.get(String(application.studentId))
    return { applicationId: application._id, name: user?.name ?? 'Student', rollNumber: profile?.rollNumber ?? null, branch: profile?.branch ?? null, currentPhase: application.currentPhase }
  })
  return { company, drive, applications, previewRecipients }
}
export async function previewCompanyCandidatesNotification(companyUserId, input, dependencies = {}) { const data = await resolveCompanyTarget(companyUserId, input, dependencies); return { recipientCount: data.applications.length, targetDescription: `${data.company.companyName ?? 'Company'} · ${data.drive.role?.title ?? 'Drive'} · ${input.target.replaceAll('_', ' ')}`, recipients: data.previewRecipients.slice(0, 20) } }
export async function sendCompanyCandidatesNotification(companyUserId, input, dependencies = {}) { const data = await resolveCompanyTarget(companyUserId, input, dependencies); if (!data.applications.length) throw new AppError('No candidates match this target.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }); const notificationModel = dependencies.notificationModel ?? Notification; const prior = await notificationModel.find({ senderId: companyUserId, idempotencyKey: input.requestId }).select('recipientId').lean(); if (prior.length) return { notificationsCreated: prior.length, recipientCount: prior.length, alreadySent: true }; const created = await createNotifications(data.applications.map(application => ({ recipientId: application.studentId, senderId: companyUserId, notificationBatchId: input.requestId, idempotencyKey: input.requestId, category: 'manual_placement_message', type: 'company_to_candidates', source: 'company', title: input.title, message: input.message, placementDriveId: data.drive._id, applicationId: application._id, companyId: data.company._id, phaseNumber: input.target === 'phase' ? input.phaseNumber : undefined, context: { action: input.target === 'phase' ? 'view_phase' : 'view_drive', audience: input.target, roleTitle: data.drive.role?.title, phaseTitle: data.drive.phases?.find(item => item.phaseNumber === input.phaseNumber)?.title } })), { notificationModel }); return { notificationsCreated: created.length, recipientCount: data.applications.length, alreadySent: false } }
