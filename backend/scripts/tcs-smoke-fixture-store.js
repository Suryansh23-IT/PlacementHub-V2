import { rm } from 'node:fs/promises'
import path from 'node:path'
import { Application } from '../src/modules/applications/application.model.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { IncidentReport } from '../src/modules/incidents/incident-report.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { DemoSeedStore } from './demo-seed-store.js'

export const TCS_SMOKE_FIXTURE_KEY = 'placementhub-v2-tcs-smoke-fixture-v1'
export const TCS_SMOKE_FIXTURE_MANIFEST_PATH = path.resolve('scripts', '.local', 'tcs-smoke-fixture-manifest.json')

function ids(values = []) {
  return values.filter(Boolean)
}

async function scopeFor(store) {
  const studentUserIds = ids(store?.studentUserIds)
  const companyUserIds = ids(store?.companyUserIds)
  const companyProfileIds = ids(store?.companyProfileIds)
  const fixtureUserIds = [...studentUserIds, ...companyUserIds]
  const drives = companyProfileIds.length
    ? await PlacementDrive.find({ companyId: { $in: companyProfileIds } }).select('_id').lean()
    : []
  const driveIds = drives.map(drive => drive._id)

  return {
    studentUserIds,
    companyUserIds,
    companyProfileIds,
    fixtureUserIds,
    driveIds,
    notificationQuery: { $or: [{ placementDriveId: { $in: driveIds } }, { recipientId: { $in: fixtureUserIds } }, { senderId: { $in: fixtureUserIds } }] },
    incidentQuery: { $or: [{ placementDriveId: { $in: driveIds } }, { studentId: { $in: studentUserIds } }, { reportedBy: { $in: companyUserIds } }] },
    restrictionQuery: { $or: [{ studentId: { $in: studentUserIds } }, { placementDriveId: { $in: driveIds } }] },
    applicationQuery: { $or: [{ placementDriveId: { $in: driveIds } }, { studentId: { $in: studentUserIds } }] },
  }
}

export async function auditTcsSmokeFixture({ key = TCS_SMOKE_FIXTURE_KEY } = {}) {
  const store = await DemoSeedStore.findOne({ key })
  if (!store) return { key, found: false, records: {} }
  const scope = await scopeFor(store)
  const [notifications, incidents, restrictions, applications, drives, studentPolicyAcceptances, recruiterPolicyAcceptances, studentProfiles, companies, users] = await Promise.all([
    Notification.countDocuments(scope.notificationQuery),
    IncidentReport.countDocuments(scope.incidentQuery),
    PlacementRestriction.countDocuments(scope.restrictionQuery),
    Application.countDocuments(scope.applicationQuery),
    PlacementDrive.countDocuments({ _id: { $in: scope.driveIds } }),
    StudentPolicyAcceptance.countDocuments({ studentId: { $in: scope.studentUserIds } }),
    RecruiterPolicyAcceptance.countDocuments({ companyId: { $in: scope.companyUserIds } }),
    StudentProfile.countDocuments({ userId: { $in: scope.studentUserIds } }),
    Company.countDocuments({ _id: { $in: scope.companyProfileIds } }),
    User.countDocuments({ _id: { $in: scope.fixtureUserIds } }),
  ])

  return {
    key,
    found: true,
    store,
    scope,
    records: { notifications, incidents, restrictions, applications, drives, studentPolicyAcceptances, recruiterPolicyAcceptances, studentProfiles, companies, users },
  }
}

export async function removeTcsSmokeFixture({ key = TCS_SMOKE_FIXTURE_KEY, manifestPath = TCS_SMOKE_FIXTURE_MANIFEST_PATH } = {}) {
  const audit = await auditTcsSmokeFixture({ key })
  if (!audit.found) {
    await rm(manifestPath, { force: true })
    return { ...audit, removed: false, manifestRemoved: true }
  }

  const { store, scope } = audit
  await Notification.deleteMany(scope.notificationQuery)
  await IncidentReport.deleteMany(scope.incidentQuery)
  await PlacementRestriction.deleteMany(scope.restrictionQuery)
  await Application.deleteMany(scope.applicationQuery)
  await PlacementDrive.deleteMany({ _id: { $in: scope.driveIds } })
  await StudentPolicyAcceptance.deleteMany({ studentId: { $in: scope.studentUserIds } })
  await RecruiterPolicyAcceptance.deleteMany({ companyId: { $in: scope.companyUserIds } })
  await StudentProfile.deleteMany({ userId: { $in: scope.studentUserIds } })
  await Company.deleteMany({ _id: { $in: scope.companyProfileIds } })
  await User.deleteMany({ _id: { $in: scope.fixtureUserIds } })
  await DemoSeedStore.deleteOne({ _id: store._id })
  await rm(manifestPath, { force: true })
  return { ...audit, removed: true, manifestRemoved: true }
}
