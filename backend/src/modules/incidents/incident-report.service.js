import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { Application } from '../applications/application.model.js'
import { PlacementRestriction } from '../applications/placement-restriction.model.js'
import { imposePlacementRestriction, removePlacementRestriction } from '../applications/placement-restriction.service.js'
import { Company } from '../companies/company.model.js'
import { createNotifications } from '../notifications/notification.service.js'
import { Notification } from '../notifications/notification.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { StudentProfile } from '../students/student.model.js'
import { IncidentReport } from './incident-report.model.js'

const notFound = message => new AppError(message, { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = message => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })

function plain(value) { return value?.toObject ? value.toObject() : value }
function assign(document, values) { if (typeof document.set === 'function') document.set(values); else Object.assign(document, values) }

async function getApprovedCompany(companyUserId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can submit incident reports.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  return company
}

export async function createCompanyIncidentReport(companyUserId, input, {
  companyModel = Company,
  applicationModel = Application,
  placementDriveModel = PlacementDrive,
  incidentReportModel = IncidentReport,
  userModel = User,
  notificationModel = Notification,
} = {}) {
  const company = await getApprovedCompany(companyUserId, { companyModel })
  const application = await applicationModel.findOne({ _id: input.applicationId })
  if (!application) throw notFound('Application was not found.')
  const drive = await placementDriveModel.findOne({ _id: application.placementDriveId, companyId: company._id })
  if (!drive) throw notFound('Applicant was not found in this Company Placement Drive.')
  const existing = await incidentReportModel.findOne({ applicationId: application._id, category: input.category, reviewStatus: 'pending_review' })
  if (existing) throw conflict('A pending incident report already exists for this applicant and category.')
  const report = await incidentReportModel.create({
    studentId: application.studentId,
    applicationId: application._id,
    placementDriveId: drive._id,
    companyId: company._id,
    phase: application.currentPhase,
    applicationStatus: application.currentStatus,
    category: input.category,
    description: input.description,
    note: input.note,
    reportedBy: companyUserId,
  })
  const admin = await userModel.findOne({ role: USER_ROLES.PLACEMENT_ADMIN, isActive: true })
  if (admin) await createNotifications([{
    recipientId: admin._id,
    senderId: companyUserId,
    category: 'incident_report',
    type: 'company_incident_report',
    source: 'company',
    title: 'Company incident report requires review',
    message: `A Company reported a ${input.category.replaceAll('_', ' ')} incident for a Placement Drive applicant.`,
    placementDriveId: drive._id,
    applicationId: application._id,
    companyId: company._id,
    context: { action: 'view_incident', audience: 'placement_admin' },
  }], { notificationModel })
  return publicIncident(report, { company: plain(company) })
}

function publicIncident(report, related = {}) {
  const value = plain(report)
  return {
    _id: value._id,
    studentId: value.studentId,
    applicationId: value.applicationId,
    placementDriveId: value.placementDriveId,
    companyId: value.companyId,
    phase: value.phase,
    applicationStatus: value.applicationStatus,
    category: value.category,
    description: value.description,
    note: value.note,
    reviewStatus: value.reviewStatus,
    decision: value.decision,
    reviewNote: value.reviewNote,
    reviewedAt: value.reviewedAt,
    restrictionId: value.restrictionId,
    archivedAt: value.archivedAt,
    createdAt: value.createdAt,
    ...related,
  }
}

async function summaries(reports, { userModel = User, companyModel = Company, placementDriveModel = PlacementDrive, profileModel = StudentProfile, restrictionModel = PlacementRestriction } = {}) {
  return Promise.all(reports.map(async report => {
    const value = plain(report)
    const [studentUser, studentProfile, company, drive, restriction] = await Promise.all([
      userModel.findOne({ _id: value.studentId }).select('name email'),
      profileModel.findOne({ userId: value.studentId }).select('rollNumber branch'),
      companyModel.findOne({ _id: value.companyId }).select('companyName recruiterName officialEmail recruiterEmail userId'),
      placementDriveModel.findOne({ _id: value.placementDriveId }).select('role'),
      value.restrictionId ? restrictionModel.findOne({ _id: value.restrictionId }) : null,
    ])
    return publicIncident(report, {
      student: studentUser ? { name: studentUser.name, email: studentUser.email, rollNumber: studentProfile?.rollNumber, branch: studentProfile?.branch } : undefined,
      company: company ? { companyName: company.companyName, recruiterName: company.recruiterName, officialEmail: company.officialEmail || company.recruiterEmail } : undefined,
      drive: drive ? { role: plain(drive).role } : undefined,
      restriction: restriction ? publicRestriction(restriction) : undefined,
    })
  }))
}

export async function listAdminIncidentReports(dependencies = {}) {
  const { incidentReportModel = IncidentReport } = dependencies
  const reports = await incidentReportModel.find({}).sort({ createdAt: -1 })
  return summaries(reports, dependencies)
}

async function restrictionSummaries(query, { placementRestrictionModel = PlacementRestriction, userModel = User, profileModel = StudentProfile } = {}) {
  const restrictions = await placementRestrictionModel.find(query).sort({ imposedAt: -1 })
  return Promise.all(restrictions.map(async restriction => {
    const value = plain(restriction)
    const [student, profile] = await Promise.all([userModel.findOne({ _id: value.studentId }).select('name email'), profileModel.findOne({ userId: value.studentId }).select('rollNumber branch')])
    return publicRestriction(restriction, { student: student ? { name: student.name, email: student.email, rollNumber: profile?.rollNumber, branch: profile?.branch } : undefined })
  }))
}

export async function listActivePlacementRestrictions(dependencies = {}) { return restrictionSummaries({ status: 'active' }, dependencies) }
export async function listPlacementRestrictionHistory(dependencies = {}) { return restrictionSummaries({ status: { $ne: 'active' } }, dependencies) }

export function publicRestriction(restriction, related = {}) {
  const value = plain(restriction)
  const temporary = value.type !== 'permanent'
  const remainingDriveCount = temporary ? value.remainingDriveCount : undefined
  const initialDriveCount = temporary ? (value.initialDriveCount ?? value.totalDriveCount ?? remainingDriveCount) : undefined
  return {
    _id: value._id,
    studentId: value.studentId,
    sourceIncidentReportId: value.sourceIncidentReportId,
    placementDriveId: value.placementDriveId,
    applicationId: value.applicationId,
    type: temporary ? 'temporary_drive_count' : 'permanent',
    status: value.status,
    initialDriveCount,
    remainingDriveCount,
    reason: value.reason,
    imposedAt: value.imposedAt,
    removedAt: value.removedAt,
    removalReason: value.removalReason,
    inactiveReason: value.inactiveReason,
    ...related,
  }
}

export async function reviewIncidentReport(adminId, incidentId, input, {
  incidentReportModel = IncidentReport,
  companyModel = Company,
  notificationModel = Notification,
  imposeRestrictionService = imposePlacementRestriction,
  ...dependencies
} = {}) {
  const report = await incidentReportModel.findOne({ _id: incidentId })
  if (!report) throw notFound('Incident report was not found.')
  const value = plain(report)
  const canResolve = value.reviewStatus === 'pending_review' || (value.reviewStatus === 'reviewed' && value.decision === 'refer_to_department')
  if (!canResolve) throw conflict('This incident report has already been resolved.')
  const now = new Date(dependencies.now ?? Date.now())
  let restriction
  if (input.action === 'temporary_restriction' || input.action === 'permanent_restriction') {
    restriction = await imposeRestrictionService(value.studentId, {
      sourceIncidentReportId: value._id,
      placementDriveId: value.placementDriveId,
      applicationId: value.applicationId,
      type: input.action === 'temporary_restriction' ? 'temporary_drive_count' : 'permanent',
      driveCount: input.driveCount,
      reason: input.reviewNote,
      imposedBy: adminId,
    }, { ...dependencies, now })
  }
  const referred = input.action === 'refer_to_department'
  assign(report, {
    reviewStatus: referred ? 'reviewed' : 'closed',
    decision: input.action,
    reviewNote: input.reviewNote,
    reviewedBy: adminId,
    reviewedAt: now,
    ...(restriction ? { restrictionId: restriction._id } : {}),
  })
  const saved = await report.save()
  const company = await companyModel.findOne({ _id: value.companyId }).select('userId companyName')
  const companyMessage = referred ? 'The incident report was referred to the department for further review.' : `The incident report was resolved: ${input.action.replaceAll('_', ' ')}.`
  const notifications = company?.userId ? [{ recipientId: company.userId, senderId: adminId, category: 'incident_report', type: 'incident_report_resolved', source: 'college', title: 'Incident report reviewed', message: companyMessage, placementDriveId: value.placementDriveId, applicationId: value.applicationId, companyId: value.companyId, context: { action: 'view_incident', audience: 'company' } }] : []
  if (input.action === 'warning_only') notifications.push({ recipientId: value.studentId, senderId: adminId, category: 'disciplinary_action', type: 'placement_warning', source: 'disciplinary_action', title: 'Placement warning issued', message: input.reviewNote, placementDriveId: value.placementDriveId, applicationId: value.applicationId, companyId: value.companyId, context: { action: 'view_application', audience: 'placement_admin' } })
  if (restriction) notifications.push({ recipientId: value.studentId, senderId: adminId, category: 'disciplinary_action', type: restriction.type === 'permanent' ? 'permanent_restriction_imposed' : 'temporary_restriction_imposed', source: 'disciplinary_action', title: 'Placement participation restriction', message: restriction.type === 'permanent' ? 'Placement participation is restricted by Placement Administration.' : `You are restricted from the next ${restriction.remainingDriveCount} Placement Drive${restriction.remainingDriveCount === 1 ? '' : 's'}.`, placementDriveId: value.placementDriveId, applicationId: value.applicationId, companyId: value.companyId, context: { action: 'view_restriction', audience: 'placement_admin' } })
  if (notifications.length) await createNotifications(notifications, { notificationModel })
  return publicIncident(saved, { restriction: restriction ? publicRestriction(restriction) : undefined })
}

export async function applyRestrictionFromIncident(adminId, incidentId, input, {
  incidentReportModel = IncidentReport,
  notificationModel = Notification,
  imposeRestrictionService = imposePlacementRestriction,
  ...dependencies
} = {}) {
  const report = await incidentReportModel.findOne({ _id: incidentId })
  if (!report) throw notFound('Incident report was not found.')
  const value = plain(report)
  if (value.archivedAt) throw conflict('This matter is closed and retained for history only.')
  if (value.reviewStatus !== 'closed') throw conflict('Complete the incident review before applying a later restriction.')
  const restriction = await imposeRestrictionService(value.studentId, {
    sourceIncidentReportId: value._id,
    placementDriveId: value.placementDriveId,
    applicationId: value.applicationId,
    type: input.type,
    driveCount: input.driveCount,
    reason: input.reason,
    imposedBy: adminId,
  }, dependencies)
  await createNotifications([{
    recipientId: value.studentId,
    senderId: adminId,
    category: 'disciplinary_action',
    type: restriction.type === 'permanent' ? 'permanent_restriction_imposed' : 'temporary_restriction_imposed',
    source: 'disciplinary_action',
    title: 'Placement participation restriction',
    message: restriction.type === 'permanent' ? 'Placement participation is restricted by Placement Administration.' : `You are restricted from the next ${restriction.remainingDriveCount} Placement Drive${restriction.remainingDriveCount === 1 ? '' : 's'}.`,
    placementDriveId: value.placementDriveId,
    applicationId: value.applicationId,
    companyId: value.companyId,
    context: { action: 'view_restriction', audience: 'placement_admin' },
  }], { notificationModel })
  return publicRestriction(restriction)
}

export async function archiveIncidentReport(adminId, incidentId, {
  incidentReportModel = IncidentReport,
  placementRestrictionModel = PlacementRestriction,
  ...dependencies
} = {}) {
  const report = await incidentReportModel.findOne({ _id: incidentId })
  if (!report) throw notFound('Incident report was not found.')
  const value = plain(report)
  if (value.reviewStatus !== 'closed') throw conflict('Only resolved incident reports can be closed as a matter.')
  const activeRestriction = await placementRestrictionModel.findOne({ studentId: value.studentId, status: 'active' })
  if (activeRestriction) throw conflict('Remove the active Placement restriction before closing this matter.')
  if (value.archivedAt) return publicIncident(report)
  assign(report, { archivedBy: adminId, archivedAt: new Date(dependencies.now ?? Date.now()) })
  return publicIncident(await report.save())
}

export async function removeAdminPlacementRestriction(adminId, restrictionId, removalReason, {
  placementRestrictionModel = PlacementRestriction,
  removeRestrictionService = removePlacementRestriction,
  notificationModel = Notification,
  ...dependencies
} = {}) {
  const restriction = await removeRestrictionService(restrictionId, adminId, removalReason, { placementRestrictionModel, ...dependencies })
  if (!restriction) throw notFound('Active Placement restriction was not found.')
  const value = plain(restriction)
  await createNotifications([{ recipientId: value.studentId, senderId: adminId, category: 'disciplinary_action', type: 'restriction_removed', source: 'disciplinary_action', title: 'Placement eligibility restored', message: 'Your Placement restriction was removed by Placement Administration.', placementDriveId: value.placementDriveId, applicationId: value.applicationId, context: { action: 'view_restriction', audience: 'placement_admin' } }], { notificationModel })
  return publicRestriction(restriction)
}
