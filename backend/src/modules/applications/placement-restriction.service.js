import { PlacementRestriction } from './placement-restriction.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'

function plain(value) { return value?.toObject ? value.toObject() : value }
function assign(document, values) { if (typeof document.set === 'function') document.set(values); else Object.assign(document, values) }
const supportedCurrentTypes = new Set(['temporary_drive_count', 'permanent'])

function requiresLegacyCompatibleRemoval(restriction) {
  const value = plain(restriction)
  return !supportedCurrentTypes.has(value.type) || !value.imposedBy
}

export async function getActivePlacementRestriction(studentId, { placementRestrictionModel = PlacementRestriction } = {}) {
  const query = placementRestrictionModel.findOne({ studentId, status: 'active' })
  return typeof query?.sort === 'function' ? query.sort({ imposedAt: -1 }) : query
}

export async function imposePlacementRestriction(studentId, input, {
  placementRestrictionModel = PlacementRestriction,
  now = new Date(),
} = {}) {
  const current = await getActivePlacementRestriction(studentId, { placementRestrictionModel })
  if (current) {
    assign(current, { status: 'inactive', inactiveReason: 'superseded', removedAt: now })
    await current.save()
  }
  const values = {
    studentId,
    sourceIncidentReportId: input.sourceIncidentReportId,
    placementDriveId: input.placementDriveId,
    applicationId: input.applicationId,
    type: input.type,
    status: 'active',
    ...(input.type === 'temporary_drive_count' ? { initialDriveCount: input.driveCount, remainingDriveCount: input.driveCount } : {}),
    consumedDriveIds: [],
    reason: input.reason,
    imposedBy: input.imposedBy,
    imposedAt: now,
  }
  try { return await placementRestrictionModel.create(values) } catch (error) {
    // Earlier M6 development used a one-per-student unique index. Reuse that
    // legacy document if it still exists so an old withdrawal record cannot
    // prevent an Admin from imposing the new review-based restriction.
    if (error?.code !== 11000) throw error
    const legacy = await placementRestrictionModel.findOne({ studentId })
    if (!legacy) throw error
    assign(legacy, { ...values, _id: legacy._id, removedBy: undefined, removedAt: undefined, removalReason: undefined, inactiveReason: undefined })
    return legacy.save()
  }
}

export async function removePlacementRestriction(restrictionId, adminId, removalReason, { placementRestrictionModel = PlacementRestriction, now = new Date() } = {}) {
  const restriction = await placementRestrictionModel.findOne({ _id: restrictionId, status: 'active' })
  if (!restriction) return null
  const values = { status: 'inactive', removedBy: adminId, removedAt: now, removalReason, inactiveReason: 'removed_by_admin' }
  if (requiresLegacyCompatibleRemoval(restriction) && typeof placementRestrictionModel.updateOne === 'function') {
    const result = await placementRestrictionModel.updateOne({ _id: restrictionId, status: 'active' }, { $set: values })
    if (result?.matchedCount === 0) return null
    // Keep the response shape consistent without rewriting legacy enum or
    // required fields that were not present when this record was created.
    assign(restriction, values)
    return restriction
  }
  assign(restriction, values)
  return restriction.save()
}

async function notifyTemporaryRestrictionCompleted(restriction, placementDriveId, dependencies) {
  // Load lazily to avoid the Notification -> Application -> Restriction import
  // cycle. The notification is intentionally emitted only after the completed
  // restriction has been persisted as inactive.
  const notificationService = dependencies.notificationService
    ?? (await import('../notifications/notification.service.js')).createNotifications
  const value = plain(restriction)
  const options = dependencies.notificationModel ? { notificationModel: dependencies.notificationModel } : undefined
  await notificationService([{
    recipientId: value.studentId,
    category: 'disciplinary_action',
    type: 'temporary_restriction_completed',
    source: 'disciplinary_action',
    title: 'Placement restriction completed',
    message: 'Your temporary placement restriction has ended. You can now participate in eligible placement drives again.',
    placementDriveId,
    applicationId: value.applicationId,
    context: { action: 'view_restriction', audience: 'placement_admin' },
  }], options)
}

export async function consumePlacementRestrictionForDrive(studentId, placementDriveId, dependencies = {}) {
  const { placementDriveModel = PlacementDrive } = dependencies
  const restriction = await getActivePlacementRestriction(studentId, dependencies)
  if (!restriction) return null
  const value = plain(restriction)
  if (value.type === 'permanent') return restriction
  const drive = await placementDriveModel.findOne({ _id: placementDriveId })
  const published = drive?.proposalStatus === PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED && drive?.lifecycleStatus === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED
  if (!published) return restriction
  // A temporary action applies only to opportunities published after it was
  // imposed. Legacy published drives without this timestamp are conservatively
  // ignored rather than incorrectly consuming a Student's future-drive count.
  if (!drive.publishedAt || new Date(drive.publishedAt).getTime() <= new Date(value.imposedAt).getTime()) return restriction
  const consumed = (value.consumedDriveIds ?? []).some(id => String(id) === String(placementDriveId))
  if (consumed) return restriction
  const remainingDriveCount = Math.max(0, value.remainingDriveCount - 1)
  assign(restriction, {
    consumedDriveIds: [...(value.consumedDriveIds ?? []), placementDriveId],
    remainingDriveCount,
    ...(remainingDriveCount === 0 ? { status: 'inactive', inactiveReason: 'drive_count_completed' } : {}),
  })
  const savedRestriction = await restriction.save()
  if (remainingDriveCount === 0) {
    await notifyTemporaryRestrictionCompleted(savedRestriction, placementDriveId, dependencies)
  }
  return savedRestriction
}
