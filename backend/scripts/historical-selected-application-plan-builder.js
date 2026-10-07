import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'

const seedKey = 'NITR-PLACEMENT-2025-26'
const assignmentsPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)
const slotsPath = new URL('../data/historical-2025-26-offer-slots.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)
const outputPath = new URL('../data/historical-2025-26-selected-applications.json', import.meta.url)

const fallbackTemplates = {
  SDE: [['OA', 'assessment'], ['Technical', 'technical_interview'], ['HR', 'hr_interview']],
  ANALYST_DATA: [['Aptitude/Case', 'assessment'], ['Analytics/Interview', 'technical_interview'], ['HR', 'hr_interview']],
  CORE: [['Screening/Aptitude', 'assessment'], ['Technical', 'technical_interview'], ['HR', 'hr_interview']],
  CONSULTING_FINANCE: [['Aptitude/Case', 'assessment'], ['Interview', 'technical_interview'], ['HR', 'hr_interview']],
  EDUCATION_MISC: [['Screening', 'assessment'], ['Interview/Demo', 'other']],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hashInt(value) {
  return Number.parseInt(createHash('sha256').update(`${seedKey}:${value}`).digest('hex').slice(0, 8), 16)
}

function iso(value) {
  return new Date(value).toISOString()
}

function usablePhases(phases) {
  return Array.isArray(phases) && phases.length >= 1 && phases.length <= 5 && phases.every((phase, index) => Number.isInteger(phase.phaseNumber) && phase.phaseNumber === index + 1 && phase.title && phase.type)
}

function phaseBlueprint(drive, roleFamily) {
  if (usablePhases(drive.phases)) return { source: 'EXISTING_DRIVE_BLUEPRINT', requiresRepair: false, phases: drive.phases.map(phase => ({ phaseNumber: phase.phaseNumber, title: phase.title, type: phase.type })) }
  const template = fallbackTemplates[roleFamily]
  assert(template, `No fallback phase template exists for ${roleFamily}`)
  return { source: `PLANNED_${roleFamily}_TEMPLATE_REPAIR`, requiresRepair: true, phases: template.map(([title, type], index) => ({ phaseNumber: index + 1, title, type })) }
}

function plusHours(date, hours) {
  const result = new Date(date)
  result.setUTCHours(result.getUTCHours() + hours)
  return result
}

function plannedSubmission(drive, primaryConfirmation, offerSlotId) {
  const open = new Date(drive.publishedAt)
  const deadline = new Date(drive.driveDetails.applicationDeadline)
  const placementLock = new Date(`${primaryConfirmation}T23:59:59.999Z`)
  const upper = deadline < placementLock ? deadline : placementLock
  assert(open <= upper, `No legal application window remains for ${offerSlotId}`)
  const dayCount = Math.floor((upper.valueOf() - open.valueOf()) / 86400000)
  const submitted = new Date(open)
  submitted.setUTCDate(submitted.getUTCDate() + (hashInt(`submission:${offerSlotId}`) % (dayCount + 1)))
  submitted.setUTCHours(13, 0, 0, 0)
  if (submitted > upper) submitted.setTime(upper.valueOf())
  assert(submitted >= open && submitted <= upper, `Planned submission is outside the application window for ${offerSlotId}`)
  return submitted
}

function selectedPhaseHistory({ submittedAt, drive, blueprint }) {
  const processStart = new Date(drive.historicalSource.startDate)
  const configuredEnd = drive.historicalSource.endDate ? new Date(drive.historicalSource.endDate) : plusHours(processStart, 8)
  const firstPhaseAt = processStart > submittedAt ? processStart : plusHours(submittedAt, 1)
  assert(firstPhaseAt <= configuredEnd, `No sensible phase window remains for source row ${drive.historicalSource.sourceRow}`)
  const span = configuredEnd.valueOf() - firstPhaseAt.valueOf()
  const phaseEvents = blueprint.phases.map((phase, index) => {
    const occurredAt = new Date(firstPhaseAt.valueOf() + Math.floor(((index + 1) / (blueprint.phases.length + 1)) * span))
    const isFinal = index === blueprint.phases.length - 1
    return {
      phase: phase.phaseNumber,
      status: isFinal ? 'selected_pending_confirmation' : 'active',
      event: isFinal ? 'provisionally_selected' : 'advanced',
      occurredAt: iso(occurredAt),
    }
  })
  return [{ phase: 0, status: 'applied', event: 'applied', occurredAt: iso(submittedAt) }, ...phaseEvents]
}

export function validateSelectedApplicationPlan({ assignments, slots, canonical, plan, drives = [] }) {
  const onCampusAssignments = assignments.filter(assignment => assignment.placementSource === 'ON_CAMPUS')
  const offCampusAssignments = assignments.filter(assignment => assignment.placementSource === 'OFF_CAMPUS')
  const applications = plan.applications
  assert(onCampusAssignments.length === 682, `Expected 682 on-campus offers, found ${onCampusAssignments.length}`)
  assert(offCampusAssignments.length === 23, `Expected 23 off-campus offers, found ${offCampusAssignments.length}`)
  assert(applications.length === 682, `Expected 682 selected applications, found ${applications.length}`)
  assert(new Set(applications.map(application => application.offerSlotId)).size === 682, 'A selected application duplicates an offer slot')
  const assignmentBySlot = new Map(assignments.map(assignment => [assignment.offerSlotId, assignment]))
  const slotById = new Map(slots.map(slot => [slot.offerSlotId, slot]))
  const rawOffersByRow = new Map(canonical.processes.map(process => [process.sourceRow, Object.values(process.rawBranchOffers).reduce((sum, count) => sum + count, 0)]))
  const pairs = new Set()
  for (const application of applications) {
    const assignment = assignmentBySlot.get(application.offerSlotId)
    const slot = slotById.get(application.offerSlotId)
    assert(assignment?.placementSource === 'ON_CAMPUS' && slot?.placementSource === 'ON_CAMPUS', `Selected application has an invalid on-campus slot: ${application.offerSlotId}`)
    assert(application.studentId === assignment.studentId && application.driveId === assignment.driveId && application.sourceRow === assignment.sourceRow, `Selected application does not match its offer assignment: ${application.offerSlotId}`)
    assert(!pairs.has(`${application.studentId}:${application.driveId}`), `Duplicate Student+Drive selected application: ${application.offerSlotId}`)
    pairs.add(`${application.studentId}:${application.driveId}`)
    assert(rawOffersByRow.get(application.sourceRow) > 0, `Zero-selection source row has a selected application: ${application.sourceRow}`)
    const submittedAt = new Date(application.applicationSubmittedAt)
    const open = new Date(application.applicationOpenAt)
    const deadline = new Date(application.applicationDeadline)
    assert(submittedAt >= open && submittedAt <= deadline, `Application is outside its drive window: ${application.applicationKey}`)
    assert(submittedAt <= new Date(`${application.firstPlacementConfirmationDate}T23:59:59.999Z`), `Application begins after placement lock: ${application.applicationKey}`)
    assert(application.phaseHistory.length === application.phaseIds.length + 1 && application.phaseHistory[0].phase === 0 && application.phaseHistory[0].event === 'applied', `Incomplete selected phase history: ${application.applicationKey}`)
    for (let index = 1; index < application.phaseHistory.length; index += 1) assert(new Date(application.phaseHistory[index].occurredAt) >= new Date(application.phaseHistory[index - 1].occurredAt), `Non-monotonic phase history: ${application.applicationKey}`)
    const finalPhase = application.phaseHistory.at(-1)
    assert(finalPhase.phase === application.phaseIds.at(-1) && finalPhase.status === 'selected_pending_confirmation' && finalPhase.event === 'provisionally_selected' && application.finalStatus === 'selected_pending_confirmation', `Selected application does not reach its final phase: ${application.applicationKey}`)
  }
  assert(new Set(applications.map(application => application.offerSlotId)).size === new Set(onCampusAssignments.map(assignment => assignment.offerSlotId)).size, 'Not every on-campus offer has exactly one selected application')
  assert(drives.length === 0 || drives.length === 207, `Expected 207 inspected historical drives, found ${drives.length}`)
  return {
    selectedApplications: applications.length,
    offCampusApplications: 0,
    phaseHistoryEvents: applications.reduce((sum, application) => sum + application.phaseHistory.length, 0),
    roleFamilyDistribution: Object.fromEntries([...new Set(applications.map(application => application.roleFamily))].sort().map(roleFamily => [roleFamily, applications.filter(application => application.roleFamily === roleFamily).length])),
  }
}

export async function loadHistoricalDrives({ driveModel = PlacementDrive } = {}) {
  const drives = await driveModel.find({ 'historicalSource.seedKey': seedKey }).select('_id publishedAt driveDetails.applicationDeadline phases historicalSource').lean()
  assert(drives.length === 207, `Expected 207 live historical drives, found ${drives.length}`)
  return drives
}

export async function buildSelectedApplicationPlan({ write = true, drives = null, dependencies } = {}) {
  const [assignmentInput, slotsInput, canonical] = await Promise.all([assignmentsPath, slotsPath, canonicalPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const liveDrives = drives ?? await loadHistoricalDrives(dependencies)
  const driveById = new Map(liveDrives.map(drive => [String(drive._id), drive]))
  const processByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  const assignmentsByStudent = Map.groupBy(assignmentInput.assignments, assignment => assignment.studentId)
  const blueprintSummary = { existingUsable: 0, requiresPlannedRepair: 0 }
  const blueprintByDrive = new Map()
  for (const drive of liveDrives) {
    const roleFamily = processByRow.get(drive.historicalSource.sourceRow)?.roleFamily
    const blueprint = phaseBlueprint(drive, roleFamily)
    blueprintByDrive.set(String(drive._id), blueprint)
    if (blueprint.requiresRepair) blueprintSummary.requiresPlannedRepair += 1
    else blueprintSummary.existingUsable += 1
  }
  const applications = assignmentInput.assignments.filter(assignment => assignment.placementSource === 'ON_CAMPUS').map(assignment => {
    const drive = driveById.get(assignment.driveId)
    assert(drive?.historicalSource?.sourceRow === assignment.sourceRow, `Offer assignment does not resolve to its historical drive: ${assignment.offerSlotId}`)
    const allStudentOffers = assignmentsByStudent.get(assignment.studentId)
    const primary = allStudentOffers.find(offer => offer.primaryOffer)
    assert(primary?.plannedConfirmationDate, `Offer chronology has no primary confirmation for ${assignment.studentId}`)
    const submittedAt = plannedSubmission(drive, primary.plannedConfirmationDate, assignment.offerSlotId)
    const blueprint = blueprintByDrive.get(assignment.driveId)
    const phaseHistory = selectedPhaseHistory({ submittedAt, drive, blueprint })
    return {
      applicationKey: `selected:${assignment.offerSlotId}`,
      studentId: assignment.studentId,
      rollNumber: assignment.rollNumber,
      driveId: assignment.driveId,
      sourceRow: assignment.sourceRow,
      offerSlotId: assignment.offerSlotId,
      applicationSubmittedAt: iso(submittedAt),
      applicationOpenAt: iso(drive.publishedAt),
      applicationDeadline: iso(drive.driveDetails.applicationDeadline),
      firstPlacementConfirmationDate: primary.plannedConfirmationDate,
      phaseTemplate: blueprint.source,
      phaseIds: blueprint.phases.map(phase => phase.phaseNumber),
      phaseHistory,
      finalStatus: 'selected_pending_confirmation',
      finalPhase: blueprint.phases.at(-1).phaseNumber,
      offerSequence: assignment.offerSequence,
      primaryOffer: assignment.primaryOffer,
      additionalOffer: assignment.additionalOffer,
      roleFamily: processByRow.get(assignment.sourceRow)?.roleFamily,
    }
  }).sort((a, b) => a.applicationKey.localeCompare(b.applicationKey))
  const plan = { seedKey, driveBlueprintSummary: blueprintSummary, applications }
  const validation = validateSelectedApplicationPlan({ assignments: assignmentInput.assignments, slots: slotsInput.slots, canonical, plan, drives: liveDrives })
  if (write) await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`)
  return { plan, validation }
}

if (process.argv[1]?.endsWith('historical-selected-application-plan-builder.js')) {
  try {
    await connectDatabase()
    const { plan, validation } = await buildSelectedApplicationPlan()
    console.info(JSON.stringify({ ...validation, ...plan.driveBlueprintSummary }, null, 2))
  } catch (error) {
    console.error('Historical selected-application plan failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDatabase()
  }
}
