import { notificationScope } from '../notifications/notification-domain.js'
import { Application } from '../applications/application.model.js'
import { Company } from '../companies/company.model.js'
import { IncidentReport } from '../incidents/incident-report.model.js'
import { Notification } from '../notifications/notification.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { evaluatePlacementDriveEligibility } from '../applications/application.service.js'
import { StudentProfile } from '../students/student.model.js'

const publishedQuery = { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED }
// Same definition as the recruitment workspace funnel: only candidates still in process.
const activeApplicationQuery = { currentStatus: { $in: ['applied', 'active'] } }
const countUnread = (recipientId, notificationModel) => notificationModel.countDocuments({ recipientId, isRead: false, ...notificationScope('placement') })

export async function getStudentDashboardSummary(studentId, {
  placementDriveModel = PlacementDrive, applicationModel = Application, notificationModel = Notification, eligibilityService = evaluatePlacementDriveEligibility, ...dependencies
} = {}) {
  const drives = await placementDriveModel.find(publishedQuery).select('_id')
  const eligibility = await Promise.all(drives.map(drive => eligibilityService(studentId, drive._id, dependencies)))
  const [activeApplications, unreadNotifications] = await Promise.all([
    applicationModel.countDocuments({ studentId, ...activeApplicationQuery }),
    countUnread(studentId, notificationModel),
  ])
  return { publishedDriveCount: drives.length, eligibleDriveCount: eligibility.filter(result => result.eligible).length, activeApplicationCount: activeApplications, unreadNotificationCount: unreadNotifications }
}

export async function getCompanyDashboardSummary(companyUserId, { companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application, notificationModel = Notification } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId })
  if (!company) return { driveCounts: { total: 0, draft: 0, submitted: 0, changesRequested: 0, approved: 0, published: 0 }, activeApplicantCount: 0, unreadNotificationCount: await countUnread(companyUserId, notificationModel) }
  const drives = await placementDriveModel.find({ companyId: company._id }).select('_id proposalStatus lifecycleStatus')
  const driveCounts = { total: drives.length, draft: 0, submitted: 0, changesRequested: 0, approved: 0, published: 0 }
  for (const drive of drives) { if (driveCounts[drive.proposalStatus] != null) driveCounts[drive.proposalStatus] += 1; if (drive.lifecycleStatus === 'published') driveCounts.published += 1 }
  const publishedIds = drives.filter(drive => drive.lifecycleStatus === 'published').map(drive => drive._id)
  const [activeApplicantCount, unreadNotificationCount] = await Promise.all([applicationModel.countDocuments({ placementDriveId: { $in: publishedIds }, ...activeApplicationQuery }), countUnread(companyUserId, notificationModel)])
  return { driveCounts, activeApplicantCount, unreadNotificationCount }
}

export async function getAdminDashboardSummary(adminId, { studentProfileModel = StudentProfile, companyModel = Company, placementDriveModel = PlacementDrive, incidentReportModel = IncidentReport, notificationModel = Notification } = {}) {
  const [pendingStudentVerificationCount, pendingCompanyApprovalCount, pendingDriveReviewCount, publishedDriveCount, pendingIncidentReviewCount, unreadNotificationCount] = await Promise.all([
    studentProfileModel.countDocuments({ verificationStatus: 'pending' }), companyModel.countDocuments({ approvalStatus: 'pending' }), placementDriveModel.countDocuments({ proposalStatus: 'submitted' }), placementDriveModel.countDocuments(publishedQuery), incidentReportModel.countDocuments({ reviewStatus: 'pending_review' }), countUnread(adminId, notificationModel),
  ])
  return { pendingStudentVerificationCount, pendingCompanyApprovalCount, pendingDriveReviewCount, publishedDriveCount, pendingIncidentReviewCount, unreadNotificationCount }
}
