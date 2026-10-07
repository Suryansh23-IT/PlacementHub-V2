import { createHash } from 'node:crypto'
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

const graphPath = new URL('../data/historical-2025-26-application-graph-plan.json', import.meta.url)
const selectedPath = new URL('../data/historical-2025-26-selected-applications.json', import.meta.url)
const assignmentsPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)
const slotsPath = new URL('../data/historical-2025-26-offer-slots.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)

function assert(condition, message) { if (!condition) throw new Error(message) }
function hashInt(value) { return Number.parseInt(createHash('sha256').update(`${HISTORICAL_SEED_KEY}:${value}`).digest('hex').slice(0, 8), 16) }
function placementPackage(ctc) { return ctc == null ? { amount: 0, currency: 'INR', period: 'not_disclosed' } : { amount: ctc, currency: 'INR', period: 'per_annum' } }
function placementOutcome(value) { return ({ FULL_TIME: 'full_time', PPO: 'ppo', INTERNSHIP: 'internship', INTERNSHIP_AND_PPO: 'internship_and_ppo' })[value] ?? 'full_time' }

async function loadInputs() {
  const [graph, selected, assignments, slots, canonical] = await Promise.all([graphPath, selectedPath, assignmentsPath, slotsPath, canonicalPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  assert(graph.seedKey === HISTORICAL_SEED_KEY && selected.seedKey === HISTORICAL_SEED_KEY && assignments.seedKey === HISTORICAL_SEED_KEY && slots.seedKey === HISTORICAL_SEED_KEY, 'Historical plan seed keys do not match')
  return { graph, selected, assignments: assignments.assignments, slots: slots.slots, canonical }
}

function plannedApplications({ graph, selected }) {
  return [...selected.applications, ...graph.unsuccessfulApplications].map(application => ({
    studentId: application.studentId,
    placementDriveId: application.driveId,
    appliedAt: new Date(application.applicationSubmittedAt),
    currentPhase: application.finalPhase ?? application.phaseHistory.at(-1).phase,
    currentStatus: application.finalStatus,
    phaseHistory: application.phaseHistory.map(entry => ({ ...entry, occurredAt: new Date(entry.occurredAt) })),
  }))
}

function notificationDocuments({ applications, records, adminId, driveById, companyById }) {
  const byApplication = new Map(applications.map(application => [`${application.studentId}:${application.placementDriveId}`, application]))
  const documents = []
  for (const record of records) {
    const application = record.applicationId ? byApplication.get(`${record.studentId}:${record.placementDriveId}`) : null
    const drive = record.placementDriveId ? driveById.get(String(record.placementDriveId)) : null
    const context = { action: application ? 'view_application' : 'view_drive', audience: 'student' }
    documents.push({ recipientId: record.studentId, senderId: adminId, idempotencyKey: `hist25-confirm-${record._id}`, category: 'placement_outcome', type: 'placement_confirmed', source: 'placement_system', title: 'Historical placement confirmed', message: 'Your 2025–26 placement outcome is confirmed in the historical season.', placementDriveId: record.placementDriveId, applicationId: record.applicationId, companyId: record.companyId, context })
    if (application) documents.push({ recipientId: record.studentId, senderId: adminId, idempotencyKey: `hist25-selected-${record._id}`, category: 'recruitment', type: 'company_selected', source: 'company', title: 'Selected by Company', message: 'You completed the final recruitment phase in the 2025–26 season.', placementDriveId: record.placementDriveId, applicationId: record.applicationId, companyId: record.companyId, phaseNumber: application.currentPhase, context })
  }
  for (const application of applications.filter(item => ['rejected', 'absent', 'withdrawn'].includes(item.currentStatus))) {
    if (hashInt(`unsuccessful-notification:${application.studentId}:${application.placementDriveId}`) % 7 !== 0) continue
    const drive = driveById.get(String(application.placementDriveId))
    documents.push({ recipientId: application.studentId, senderId: adminId, idempotencyKey: `hist25-app-${application.studentId}-${application.placementDriveId}`, category: 'recruitment', type: `application_${application.currentStatus}`, source: 'placement_system', title: application.currentStatus === 'rejected' ? 'Recruitment update' : 'Recruitment journey update', message: `Your historical recruitment journey was marked ${application.currentStatus}.`, placementDriveId: application.placementDriveId, companyId: drive?.companyId, context: { action: 'view_application', audience: 'student' } })
  }
  for (const drive of driveById.values()) {
    const company = companyById.get(String(drive.companyId))
    if (company?.userId) documents.push({ recipientId: company.userId, senderId: adminId, idempotencyKey: `hist25-company-${drive._id}`, category: 'drive', type: 'historical_drive_completed', source: 'placement_system', title: 'Historical drive completed', message: 'Your 2025–26 recruitment drive history is available.', placementDriveId: drive._id, companyId: company._id, context: { action: 'view_drive', audience: 'company' } })
  }
  for (let index = 1; index <= 20; index += 1) documents.push({ recipientId: adminId, senderId: adminId, idempotencyKey: `hist25-admin-${index}`, category: 'historical_seed', type: 'historical_season_review', source: 'placement_system', title: 'Historical season review', message: `Historical 2025–26 reconstruction review ${index} is available.`, context: { action: 'view_drive', audience: 'placement_admin' } })
  return documents
}

export async function seedHistoricalApplicationGraph({ dependencies = {} } = {}) {
  const input = await loadInputs()
  const { graph, selected, assignments, slots, canonical } = input
  const models = { Application, PlacementRecord, Notification, PlacementDrive, Company, User, HistoricalSeedManifest, ...dependencies }
  assert(mongoose.connection.name.toLowerCase().includes('placementhub'), `Refusing to seed unexpected database: ${mongoose.connection.name}`)
  const manifest = await models.HistoricalSeedManifest.findOne({ seedKey: HISTORICAL_SEED_KEY })
  assert(manifest?.studentUserIds?.length === 844 && manifest.companyProfileIds?.length === 203 && manifest.placementDriveIds?.length === 207, 'Historical foundation is incomplete')
  if (manifest.applicationIds?.length === 11348 && manifest.placementRecordIds?.length === 705 && manifest.notificationIds?.length) return { status: 'already_seeded', applications: manifest.applicationIds.length, placementRecords: manifest.placementRecordIds.length, notifications: manifest.notificationIds.length }
  const [existingApplications, existingRecords, existingNotifications, drives, companies, admin] = await Promise.all([
    models.Application.countDocuments(), models.PlacementRecord.countDocuments(), models.Notification.countDocuments(),
    models.PlacementDrive.find({ _id: { $in: manifest.placementDriveIds } }).select('_id companyId role historicalSource').lean(),
    models.Company.find({ _id: { $in: manifest.companyProfileIds } }).select('_id userId').lean(),
    models.User.findOne({ role: 'placement_admin' }).select('_id').lean(),
  ])
  assert((existingApplications === 0 || (existingApplications === 11348 && manifest.applicationIds?.length === 11348)) && existingRecords === 0 && existingNotifications === 0, 'Refusing C3C seed because existing business records are not in a resumable C3C state')
  assert(drives.length === 207 && admin, 'Historical drives or Placement Admin are missing')
  const applications = plannedApplications({ graph, selected })
  assert(applications.length === 11348 && applications.reduce((sum, application) => sum + application.phaseHistory.length, 0) === 33809, 'Application graph plan is not locked')
  const driveById = new Map(drives.map(drive => [String(drive._id), drive]))
  const companyById = new Map(companies.map(company => [String(company._id), company]))
  const slotById = new Map(slots.map(slot => [slot.offerSlotId, slot]))
  const processByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  const selectedBySlot = new Map(selected.applications.map(application => [application.offerSlotId, application]))
  const start = performance.now()
  manifest.status = 'seeding'
  await manifest.save()
  const insertedApplications = manifest.applicationIds?.length === 11348
    ? await models.Application.find({ _id: { $in: manifest.applicationIds } })
    : await models.Application.insertMany(applications, { ordered: true })
  if (!manifest.applicationIds?.length) {
    manifest.applicationIds = insertedApplications.map(application => application._id)
    await manifest.save()
  }
  const applicationByPair = new Map(insertedApplications.map(application => [`${application.studentId}:${application.placementDriveId}`, application]))
  const recordDocs = assignments.map(assignment => {
    const slot = slotById.get(assignment.offerSlotId)
    const process = processByRow.get(assignment.sourceRow)
    assert(slot && process, `Placement assignment source is missing: ${assignment.offerSlotId}`)
    if (assignment.placementSource === 'ON_CAMPUS') {
      const planned = selectedBySlot.get(assignment.offerSlotId)
      const application = applicationByPair.get(`${assignment.studentId}:${assignment.driveId}`)
      const drive = driveById.get(assignment.driveId)
      assert(planned && application && drive, `On-campus placement cannot resolve selected application: ${assignment.offerSlotId}`)
      return { studentId: assignment.studentId, applicationId: application._id, placementDriveId: drive._id, companyId: drive.companyId, employerName: slot.companyName, placementSource: 'ON_CAMPUS', outcomeType: placementOutcome(slot.mappedOutcomeType), role: drive.role.title, package: placementPackage(slot.ctc), verificationState: 'confirmed', companySelectedAt: new Date(`${assignment.plannedOfferDate}T18:00:00.000Z`), studentReportedAt: new Date(`${assignment.plannedOfferDate}T19:00:00.000Z`), adminVerifiedAt: new Date(`${assignment.plannedConfirmationDate}T18:00:00.000Z`), notes: `Historical 2025–26 reconstructed source row ${assignment.sourceRow}.`, history: [{ event: 'company_selected_historical', occurredAt: new Date(`${assignment.plannedOfferDate}T18:00:00.000Z`), actorId: admin._id }, { event: 'admin_confirmed_historical', occurredAt: new Date(`${assignment.plannedConfirmationDate}T18:00:00.000Z`), actorId: admin._id }] }
    }
    return { studentId: assignment.studentId, employerName: slot.companyName, placementSource: 'OFF_CAMPUS', outcomeType: placementOutcome(slot.mappedOutcomeType), role: process.originalSector || process.roleFamily, package: placementPackage(slot.ctc), verificationState: 'confirmed', companySelectedAt: new Date(`${assignment.plannedOfferDate}T18:00:00.000Z`), adminVerifiedAt: new Date(`${assignment.plannedConfirmationDate}T18:00:00.000Z`), notes: `Historical off-campus reconstruction source row ${assignment.sourceRow}; chronology date is synthetic because the source has no process date.`, history: [{ event: 'admin_recorded_off_campus_historical', occurredAt: new Date(`${assignment.plannedConfirmationDate}T18:00:00.000Z`), actorId: admin._id }] }
  })
  const onCampusRecordDocs = recordDocs.filter(record => record.placementSource === 'ON_CAMPUS')
  const offCampusRecordDocs = recordDocs.filter(record => record.placementSource === 'OFF_CAMPUS')
  const insertedOnCampusRecords = await models.PlacementRecord.insertMany(onCampusRecordDocs, { ordered: true })
  // MongoDB's existing sparse applicationId index treats a Mongoose-created
  // null differently from an omitted BSON field. Off-campus outcomes have no
  // application by design, so insert their validated raw documents without
  // serialising applicationId at all.
  const now = new Date()
  const rawOffCampusRecords = offCampusRecordDocs.map(record => ({ ...new models.PlacementRecord(record).toObject(), createdAt: now, updatedAt: now }))
  const offCampusInsert = await models.PlacementRecord.collection.insertMany(rawOffCampusRecords, { ordered: true })
  const insertedOffCampusRecords = await models.PlacementRecord.find({ _id: { $in: Object.values(offCampusInsert.insertedIds) } })
  const insertedRecords = [...insertedOnCampusRecords, ...insertedOffCampusRecords]
  manifest.placementRecordIds = insertedRecords.map(record => record._id)
  await manifest.save()
  const notifications = notificationDocuments({ applications: insertedApplications, records: insertedRecords, adminId: admin._id, driveById, companyById })
  const insertedNotifications = await models.Notification.insertMany(notifications, { ordered: true })
  manifest.notificationIds = insertedNotifications.map(notification => notification._id)
  manifest.status = 'ready'
  await manifest.save()
  return { status: 'seeded', applications: insertedApplications.length, phaseHistoryEvents: applications.reduce((sum, application) => sum + application.phaseHistory.length, 0), placementRecords: insertedRecords.length, notifications: insertedNotifications.length, durationMs: Math.round(performance.now() - start) }
}

if (process.argv[1]?.endsWith('seed-historical-application-graph.js')) {
  try { await connectDatabase(); console.info(JSON.stringify(await seedHistoricalApplicationGraph(), null, 2)) } catch (error) { console.error('Historical C3C seed failed:', error.message); process.exitCode = 1 } finally { await disconnectDatabase() }
}
