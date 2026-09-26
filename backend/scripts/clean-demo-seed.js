import { rm } from 'node:fs/promises'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { Application } from '../src/modules/applications/application.model.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { DEMO_SEED_KEY, DemoSeedStore } from './demo-seed-store.js'

async function run() {
  await connectDatabase()
  try {
    const seed = await DemoSeedStore.findOne({ key: DEMO_SEED_KEY })
    if (!seed) {
      console.info(JSON.stringify({ status: 'nothing_to_clean', students: 0, companies: 0 }))
      return
    }
    const studentIds = seed.studentUserIds
    const companyIds = seed.companyUserIds
    const companyProfiles = await Company.find({ userId: { $in: companyIds } }).select('_id').lean()
    const companyProfileIds = companyProfiles.map(company => company._id)
    const drives = await PlacementDrive.find({ companyId: { $in: companyProfileIds } }).select('_id').lean()
    const driveIds = drives.map(drive => drive._id)
    await Notification.deleteMany({ $or: [{ recipientId: { $in: [...studentIds, ...companyIds] } }, { placementDriveId: { $in: driveIds } }] })
    await Application.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { placementDriveId: { $in: driveIds } }] })
    await PlacementRestriction.deleteMany({ studentId: { $in: studentIds } })
    await PlacementDrive.deleteMany({ _id: { $in: driveIds } })
    await StudentPolicyAcceptance.deleteMany({ studentId: { $in: studentIds } })
    await RecruiterPolicyAcceptance.deleteMany({ companyId: { $in: companyIds } })
    await StudentProfile.deleteMany({ userId: { $in: studentIds } })
    await Company.deleteMany({ userId: { $in: companyIds } })
    await User.deleteMany({ _id: { $in: [...studentIds, ...companyIds] } })
    if (seed.createdRecruiterPolicyId) await RecruiterPlacementPolicy.deleteOne({ _id: seed.createdRecruiterPolicyId })
    await rm(seed.pdfDirectory, { recursive: true, force: true })
    await DemoSeedStore.deleteOne({ _id: seed._id })
    console.info(JSON.stringify({ status: 'cleaned', students: studentIds.length, companies: companyIds.length, drives: driveIds.length }))
  } finally {
    await disconnectDatabase()
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1 })
