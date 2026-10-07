import { rm } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../src/config/env.js'
import { Application } from '../src/modules/applications/application.model.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { IncidentReport } from '../src/modules/incidents/incident-report.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { PlacementRecord } from '../src/modules/placements/placement-record.model.js'
import { RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { DemoSeedStore, DEMO_SEED_KEY } from './demo-seed-store.js'

const dependencies = { User, Company, PlacementDrive, Application, PlacementRecord, Notification, PlacementRestriction, IncidentReport, StudentPolicyAcceptance, RecruiterPolicyAcceptance, StudentProfile, DemoSeedStore }
const ids = values => values.filter(Boolean)
const isWithin = (candidate, root) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export async function auditLegacyDemoCleanup({ models = dependencies } = {}) {
  const [students, companies, drives, demoStore] = await Promise.all([
    models.User.find({ role: 'student' }).select('_id').lean(),
    models.Company.find({}).select('_id userId').lean(),
    models.PlacementDrive.find({}).select('_id').lean(),
    models.DemoSeedStore.findOne({ key: DEMO_SEED_KEY }),
  ])
  const studentIds = students.map(student => student._id)
  const companyProfileIds = companies.map(company => company._id)
  const companyUserIds = companies.map(company => company.userId)
  const driveIds = drives.map(drive => drive._id)
  const userIds = [...studentIds, ...companyUserIds]
  const applicationQuery = { $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }] }
  const [applications, applicationRows] = await Promise.all([models.Application.countDocuments(applicationQuery), models.Application.find(applicationQuery).select('_id').lean()])
  const applicationIds = applicationRows.map(application => application._id)
  const notificationQuery = { $or: [{ recipientId: { $in: userIds } }, { senderId: { $in: userIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] }
  const relatedQuery = { $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] }
  const [placementRecords, notifications, restrictions, incidents, studentPolicyAcceptances, recruiterPolicyAcceptances, profiles] = await Promise.all([
    models.PlacementRecord.countDocuments({ $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] }),
    models.Notification.countDocuments(notificationQuery), models.PlacementRestriction.countDocuments(relatedQuery), models.IncidentReport.countDocuments(relatedQuery),
    models.StudentPolicyAcceptance.countDocuments({ studentId: { $in: studentIds } }), models.RecruiterPolicyAcceptance.countDocuments({ companyId: { $in: companyUserIds } }), models.StudentProfile.find({ userId: { $in: studentIds } }).select('resume collegeResult class10 class12').lean(),
  ])
  const uploadPaths = profiles.flatMap(profile => [profile.resume?.storagePath, profile.collegeResult?.storagePath, profile.class10?.marksheet?.storagePath, profile.class12?.marksheet?.storagePath].filter(Boolean))
  return { mode: 'dry_run', requiresConfirmation: true, scope: 'all current non-admin placement business records', demoSeedPresent: Boolean(demoStore), ids: { studentIds, companyUserIds, companyProfileIds, driveIds, applicationIds }, records: { studentUsers: studentIds.length, studentProfiles: profiles.length, companyUsers: companyUserIds.length, companyProfiles: companyProfileIds.length, placementDrives: driveIds.length, applications, placementRecords, notifications, studentPolicyAcceptances, recruiterPolicyAcceptances, restrictions, incidents, relatedUploads: uploadPaths.length }, deletionOrder: ['notifications', 'placementRecords', 'placementRestrictions', 'incidents', 'applications', 'placementDrives', 'studentPolicyAcceptances', 'recruiterPolicyAcceptances', 'studentProfiles', 'companyProfiles', 'studentUsers', 'companyUsers', 'legacyDemoManifest'], preserved: ['Placement Admin user', 'InstitutionProfile', 'branch/settings', 'policy definitions', 'system configuration'], uploadPaths }
}

export async function cleanupLegacyDemo({ confirm = false, models = dependencies, remove = rm } = {}) {
  const audit = await auditLegacyDemoCleanup({ models })
  if (!confirm) return { ...audit, removed: false }
  const uploadRoot = path.resolve(env.RESUME_UPLOAD_DIR)
  for (const uploadPath of audit.uploadPaths) {
    if (!isWithin(uploadPath, uploadRoot)) throw new Error(`Refusing to remove a profile upload outside the configured upload root: ${uploadPath}`)
  }
  const { studentIds, companyUserIds, companyProfileIds, driveIds, applicationIds } = audit.ids
  const userIds = [...studentIds, ...companyUserIds]
  await models.Notification.deleteMany({ $or: [{ recipientId: { $in: userIds } }, { senderId: { $in: userIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] })
  await models.PlacementRecord.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] })
  await models.PlacementRestriction.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] })
  await models.IncidentReport.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }, { applicationId: { $in: applicationIds } }] })
  await models.Application.deleteMany({ _id: { $in: applicationIds } })
  await models.PlacementDrive.deleteMany({ _id: { $in: driveIds } })
  await models.StudentPolicyAcceptance.deleteMany({ studentId: { $in: studentIds } })
  await models.RecruiterPolicyAcceptance.deleteMany({ companyId: { $in: companyUserIds } })
  await models.StudentProfile.deleteMany({ userId: { $in: studentIds } })
  await models.Company.deleteMany({ _id: { $in: companyProfileIds } })
  await models.User.deleteMany({ _id: { $in: userIds } })
  for (const uploadPath of audit.uploadPaths) await remove(uploadPath, { force: true })
  const demoStore = await models.DemoSeedStore.findOne({ key: DEMO_SEED_KEY })
  if (demoStore?.pdfDirectory) await remove(demoStore.pdfDirectory, { recursive: true, force: true })
  if (demoStore) await models.DemoSeedStore.deleteOne({ _id: demoStore._id })
  return { ...audit, mode: 'execute', removed: true }
}
