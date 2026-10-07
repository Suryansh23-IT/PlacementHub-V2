import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Application } from '../src/modules/applications/application.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { PlacementRecord } from '../src/modules/placements/placement-record.model.js'
import { HISTORICAL_SEED_KEY, HistoricalSeedManifest } from './historical-seed-manifest.js'

const rosterPath = new URL('../data/historical-2025-26-placed-students.json', import.meta.url)
const assignmentsPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)
const graphPath = new URL('../data/historical-2025-26-application-graph-plan.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)

const offerTargets = { Biomedical: 9, Biotechnology: 24, Chemical: 63, Civil: 62, CSE: 85, Electrical: 96, ECE: 57, IT: 88, Mechanical: 88, Metallurgical: 74, Mining: 59 }
const placedTargets = { Biomedical: 9, Biotechnology: 21, Chemical: 55, Civil: 56, CSE: 70, Electrical: 90, ECE: 50, IT: 77, Mechanical: 76, Metallurgical: 68, Mining: 55 }
function assert(condition, message) { if (!condition) throw new Error(message) }

export async function reconcileHistoricalApplicationGraph() {
  if (!mongoose.connection.name.toLowerCase().includes('placementhub')) throw new Error(`Refusing to reconcile unexpected database: ${mongoose.connection.name}`)
  const [roster, assignmentsInput, graph, canonical] = await Promise.all([rosterPath, assignmentsPath, graphPath, canonicalPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const manifest = await HistoricalSeedManifest.findOne({ seedKey: HISTORICAL_SEED_KEY }).lean()
  assert(manifest?.applicationIds?.length === 11348 && manifest.placementRecordIds?.length === 705 && manifest.notificationIds?.length === 3168, 'Historical manifest does not own the complete C3C dataset')
  const [students, companies, drives, applications, records, notifications] = await Promise.all([
    User.countDocuments({ _id: { $in: manifest.studentUserIds }, role: 'student' }),
    Company.countDocuments({ _id: { $in: manifest.companyProfileIds } }),
    PlacementDrive.find({ _id: { $in: manifest.placementDriveIds } }).select('_id historicalSource').lean(),
    Application.find({ _id: { $in: manifest.applicationIds } }).select('studentId placementDriveId appliedAt currentPhase currentStatus phaseHistory').lean(),
    PlacementRecord.find({ _id: { $in: manifest.placementRecordIds } }).select('studentId applicationId placementDriveId placementSource verificationState').lean(),
    Notification.countDocuments({ _id: { $in: manifest.notificationIds } }),
  ])
  assert(students === 844 && companies === 203 && drives.length === 207 && applications.length === 11348 && records.length === 705 && notifications === 3168, 'Live historical entity counts do not match the lock')
  const statusCounts = Object.fromEntries(['selected_pending_confirmation', 'rejected', 'absent', 'withdrawn'].map(status => [status, applications.filter(application => application.currentStatus === status).length]))
  assert(statusCounts.selected_pending_confirmation === 682 && statusCounts.rejected === 7436 && statusCounts.absent === 2121 && statusCounts.withdrawn === 1109, 'Live application status counts do not match the plan')
  const phaseHistoryEvents = applications.reduce((sum, application) => sum + application.phaseHistory.length, 0)
  assert(phaseHistoryEvents === 33809, `Live phase history count mismatch: ${phaseHistoryEvents}`)
  const confirmed = records.filter(record => record.verificationState === 'confirmed')
  assert(confirmed.length === 705, 'All historical placement records must be confirmed')
  const rosterById = new Map([...roster.placedStudents, ...roster.unplacedStudents].map(student => [student.studentId, student]))
  const branchOffers = {}; const branchPlaced = {}
  for (const branch of Object.keys(offerTargets)) { branchOffers[branch] = confirmed.filter(record => rosterById.get(String(record.studentId))?.branch === branch).length; branchPlaced[branch] = new Set(confirmed.filter(record => rosterById.get(String(record.studentId))?.branch === branch).map(record => String(record.studentId))).size; assert(branchOffers[branch] === offerTargets[branch] && branchPlaced[branch] === placedTargets[branch], `Branch reconciliation failed: ${branch}`) }
  assert(new Set(confirmed.map(record => String(record.studentId))).size === 627, 'Live unique placed count mismatch')
  const onCampus = confirmed.filter(record => record.placementSource === 'ON_CAMPUS'); const offCampus = confirmed.filter(record => record.placementSource === 'OFF_CAMPUS')
  assert(onCampus.length === 682 && offCampus.length === 23 && offCampus.every(record => !record.applicationId && !record.placementDriveId), 'On/off-campus placement split is invalid')
  const appById = new Map(applications.map(application => [String(application._id), application])); assert(onCampus.every(record => appById.get(String(record.applicationId))?.currentStatus === 'selected_pending_confirmation'), 'On-campus records do not resolve to selected applications')
  const applicationPairs = applications.map(application => `${application.studentId}:${application.placementDriveId}`); assert(new Set(applicationPairs).size === applications.length, 'Live database has duplicate Student+Drive applications')
  const primaryByStudent = new Map(assignmentsInput.assignments.filter(assignment => assignment.primaryOffer).map(assignment => [assignment.studentId, assignment.plannedConfirmationDate]))
  assert(applications.every(application => new Date(application.appliedAt) <= new Date(`${primaryByStudent.get(String(application.studentId)) ?? '2026-12-31'}T23:59:59.999Z`)), 'Live application violates placement lock')
  assert(applications.filter(application => application.currentStatus === 'selected_pending_confirmation').every(application => application.phaseHistory.at(-1)?.phase === application.currentPhase && application.phaseHistory.at(-1)?.status === 'selected_pending_confirmation'), 'Selected application final phase is invalid')
  const appByDrive = Map.groupBy(applications, application => String(application.placementDriveId)); const funnelByDrive = new Map(graph.driveFunnels.map(funnel => [funnel.driveId, funnel]));
  for (const drive of drives) { const live = appByDrive.get(String(drive._id)) ?? []; const planned = funnelByDrive.get(String(drive._id)); assert(planned && live.length === planned.applicants && live.filter(application => application.currentStatus === 'selected_pending_confirmation').length === planned.selected, `Live funnel mismatch for source row ${drive.historicalSource.sourceRow}`); if (Object.values(drive.historicalSource.rawBranchOffers ?? {}).reduce((sum, count) => sum + count, 0) === 0) assert(planned.selected === 0 && planned.applicants > 0, `Zero-selection funnel mismatch for row ${drive.historicalSource.sourceRow}`) }
  return { students, companies, drives: drives.length, applications: applications.length, phaseHistoryEvents, statusCounts: { selected: statusCounts.selected_pending_confirmation, rejected: statusCounts.rejected, absent: statusCounts.absent, withdrawn: statusCounts.withdrawn }, placementRecords: records.length, uniquePlaced: 627, unplaced: 217, onCampusRecords: onCampus.length, offCampusRecords: offCampus.length, branchOffers, branchPlaced, notifications }
}

if (process.argv[1]?.endsWith('reconcile-historical-application-graph.js')) {
  try { await connectDatabase(); console.info(JSON.stringify(await reconcileHistoricalApplicationGraph(), null, 2)) } catch (error) { console.error('Historical C3C reconciliation failed:', error.message); process.exitCode = 1 } finally { await disconnectDatabase() }
}
