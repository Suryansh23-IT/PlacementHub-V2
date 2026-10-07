import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'

const seedKey = 'NITR-PLACEMENT-2025-26'
const rosterPath = new URL('../data/historical-2025-26-placed-students.json', import.meta.url)
const assignmentsPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)
const selectedPath = new URL('../data/historical-2025-26-selected-applications.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)
const outputPath = new URL('../data/historical-2025-26-application-graph-plan.json', import.meta.url)

const fullBranch = { Biomedical: 'Biomedical Engineering', Biotechnology: 'Biotechnology', Chemical: 'Chemical Engineering', Civil: 'Civil Engineering', CSE: 'Computer Science and Engineering', Electrical: 'Electrical Engineering', ECE: 'Electronics and Communication Engineering', IT: 'Information Technology', Mechanical: 'Mechanical Engineering', Metallurgical: 'Metallurgical and Materials Engineering', Mining: 'Mining Engineering' }
const showcaseOutcomes = { 'bt039@ait.ac.in': 'withdrawn', 'cse096@ait.ac.in': 'absent' }
const manyRejectionsEmail = 'mi033@ait.ac.in'

function assert(condition, message) { if (!condition) throw new Error(message) }
function hashInt(value) { return Number.parseInt(createHash('sha256').update(`${seedKey}:${value}`).digest('hex').slice(0, 8), 16) }
function ordered(values, key) { return [...values].sort((left, right) => hashInt(key(left)).toString(16).padStart(8, '0').localeCompare(hashInt(key(right)).toString(16).padStart(8, '0')) || key(left).localeCompare(key(right))) }
function iso(value) { return new Date(value).toISOString() }
function plusHours(value, hours) { const result = new Date(value); result.setUTCHours(result.getUTCHours() + hours); return result }

function targetAttempts(student, selectedCount) {
  if (student.email === 'bt006@ait.ac.in') return Math.max(5, selectedCount)
  if (student.email === 'ee109@ait.ac.in') return Math.max(11, selectedCount)
  if (student.email === 'cse010@ait.ac.in') return Math.max(19, selectedCount)
  if (student.email === 'me085@ait.ac.in') return 26
  if (student.unplaced) return 18 + (hashInt(`unplaced-attempts:${student.email}`) % 13)
  return Math.max(selectedCount, 6 + (hashInt(`placed-attempts:${student.email}`) % 9))
}

function applicationSubmittedAt(drive, placementLockDate, applicationKey) {
  const open = new Date(drive.publishedAt)
  const deadline = new Date(drive.driveDetails.applicationDeadline)
  const lock = new Date(`${placementLockDate}T23:59:59.999Z`)
  const upper = deadline < lock ? deadline : lock
  assert(open <= upper, `No legal application window for ${applicationKey}`)
  const spanDays = Math.floor((upper.valueOf() - open.valueOf()) / 86400000)
  const submittedAt = new Date(open)
  submittedAt.setUTCDate(submittedAt.getUTCDate() + (hashInt(`submitted:${applicationKey}`) % (spanDays + 1)))
  submittedAt.setUTCHours(13, 0, 0, 0)
  if (submittedAt > upper) submittedAt.setTime(upper.valueOf())
  assert(submittedAt >= open && submittedAt <= upper, `Invalid submission time for ${applicationKey}`)
  return submittedAt
}

function phaseHistoryForOutcome({ drive, submittedAt, outcome }) {
  const phases = drive.phases
  const processStart = new Date(drive.historicalSource.startDate)
  const processEnd = drive.historicalSource.endDate ? new Date(drive.historicalSource.endDate) : plusHours(processStart, 8)
  const firstPhaseAt = processStart > submittedAt ? processStart : plusHours(submittedAt, 1)
  const terminalPhaseIndex = outcome === 'rejected' || outcome === 'absent'
    ? hashInt(`terminal:${drive._id}:${submittedAt.toISOString()}`) % phases.length
    : Math.min(phases.length - 1, hashInt(`withdraw:${drive._id}:${submittedAt.toISOString()}`) % Math.max(1, phases.length - 1))
  const history = [{ phase: 0, status: 'applied', event: 'applied', occurredAt: iso(submittedAt) }]
  const terminalAt = new Date(firstPhaseAt.valueOf() + Math.floor(((terminalPhaseIndex + 1) / (phases.length + 1)) * (processEnd.valueOf() - firstPhaseAt.valueOf())))
  for (let index = 0; index <= terminalPhaseIndex; index += 1) {
    const phase = phases[index]
    const occurredAt = new Date(firstPhaseAt.valueOf() + Math.floor(((index + 1) / (phases.length + 1)) * (processEnd.valueOf() - firstPhaseAt.valueOf())))
    const terminal = index === terminalPhaseIndex
    history.push({
      phase: phase.phaseNumber,
      status: terminal ? outcome : 'active',
      event: terminal ? (outcome === 'rejected' ? 'rejected' : outcome === 'absent' ? 'marked_absent' : 'withdrawn') : 'advanced',
      occurredAt: iso(terminal ? terminalAt : occurredAt),
    })
  }
  return history
}

function outcomeFor(student, index) {
  if (student.email === manyRejectionsEmail && index < 8) return 'rejected'
  if (index === 0 && showcaseOutcomes[student.email]) return showcaseOutcomes[student.email]
  const roll = hashInt(`outcome:${student.email}:${index}`) % 10
  return roll < 7 ? 'rejected' : roll < 9 ? 'absent' : 'withdrawn'
}

function ensureUsableDrive(drive) {
  assert(Array.isArray(drive.phases) && drive.phases.length >= 1 && drive.phases.length <= 5 && drive.phases.every((phase, index) => phase.phaseNumber === index + 1 && phase.title && phase.type), `Drive ${drive._id} lacks a usable phase blueprint`)
}

function placementLockByStudent(assignments) {
  const primary = new Map()
  for (const assignment of assignments.filter(item => item.primaryOffer)) primary.set(assignment.studentId, assignment.plannedConfirmationDate)
  assert(primary.size === 627, `Expected 627 primary placement confirmations, found ${primary.size}`)
  return primary
}

function funnelFor(drive, applications) {
  const phaseEntries = {}
  let advanced = 0
  for (const application of applications) for (const entry of application.phaseHistory.slice(1)) {
    phaseEntries[entry.phase] = (phaseEntries[entry.phase] ?? 0) + 1
    if (entry.event === 'advanced') advanced += 1
  }
  return {
    driveId: String(drive._id),
    sourceRow: drive.historicalSource.sourceRow,
    applicants: applications.length,
    phaseEntries,
    advanced,
    rejected: applications.filter(application => application.finalStatus === 'rejected').length,
    absent: applications.filter(application => application.finalStatus === 'absent').length,
    withdrawn: applications.filter(application => application.finalStatus === 'withdrawn').length,
    selected: applications.filter(application => application.finalStatus === 'selected_pending_confirmation').length,
  }
}

export function validateApplicationGraphPlan({ roster, assignments, selectedPlan, canonical, plan, drives = [] }) {
  const students = [...roster.placedStudents.map(student => ({ ...student, unplaced: false })), ...roster.unplacedStudents.map(student => ({ ...student, unplaced: true }))]
  const selected = selectedPlan.applications
  const unsuccessful = plan.unsuccessfulApplications
  const allApplications = [...selected, ...unsuccessful]
  assert(students.length === 844 && roster.placedStudents.length === 627 && roster.unplacedStudents.length === 217, 'Student roster invariants changed')
  assert(assignments.length === 705 && assignments.filter(item => item.placementSource === 'ON_CAMPUS').length === 682 && assignments.filter(item => item.placementSource === 'OFF_CAMPUS').length === 23, 'Offer assignment invariants changed')
  assert(selected.length === 682 && unsuccessful.every(application => ['rejected', 'absent', 'withdrawn'].includes(application.finalStatus)), 'Selected or unsuccessful plan counts are invalid')
  assert(new Set(selected.map(application => application.offerSlotId)).size === 682, 'Selected offer applications changed')
  const studentIds = new Set(students.map(student => student.studentId))
  const driveIds = new Set(plan.driveFunnels.map(funnel => funnel.driveId))
  const pairs = new Set()
  for (const application of allApplications) {
    assert(studentIds.has(application.studentId) && driveIds.has(application.driveId), `Invalid application reference: ${application.applicationKey}`)
    const pair = `${application.studentId}:${application.driveId}`
    assert(!pairs.has(pair), `Duplicate Student+Drive application: ${application.applicationKey}`)
    pairs.add(pair)
    const submitted = new Date(application.applicationSubmittedAt)
    assert(submitted >= new Date(application.applicationOpenAt) && submitted <= new Date(application.applicationDeadline), `Application window violation: ${application.applicationKey}`)
    assert(submitted <= new Date(`${application.firstPlacementConfirmationDate}T23:59:59.999Z`), `Placement-lock violation: ${application.applicationKey}`)
    assert(application.phaseHistory[0]?.phase === 0 && application.phaseHistory[0]?.event === 'applied', `Missing initial application history: ${application.applicationKey}`)
    for (let index = 1; index < application.phaseHistory.length; index += 1) assert(new Date(application.phaseHistory[index].occurredAt) >= new Date(application.phaseHistory[index - 1].occurredAt), `Non-monotonic history: ${application.applicationKey}`)
  }
  assert(new Set(allApplications.map(application => application.studentId)).size === 844, 'Not all 844 students are represented')
  assert(plan.driveFunnels.length === 207 && new Set(plan.driveFunnels.map(funnel => funnel.driveId)).size === 207, 'Every historical drive must have one funnel')
  const canonicalByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  for (const funnel of plan.driveFunnels) {
    const source = canonicalByRow.get(funnel.sourceRow)
    const corresponding = allApplications.filter(application => application.driveId === funnel.driveId)
    assert(funnel.applicants === corresponding.length && funnel.selected === corresponding.filter(application => application.finalStatus === 'selected_pending_confirmation').length, `Funnel does not reconcile for row ${funnel.sourceRow}`)
    if (Object.values(source.rawBranchOffers).reduce((sum, count) => sum + count, 0) === 0) assert(funnel.selected === 0 && funnel.applicants > 0, `Zero-selection drive ${funnel.sourceRow} lacks a believable zero-selection funnel`)
  }
  const lookupByEmail = new Map(students.map(student => [student.email, student.studentId]))
  const forEmail = email => allApplications.filter(application => application.studentId === lookupByEmail.get(email))
  assert(forEmail('bt006@ait.ac.in').length >= 3 && forEmail('ee109@ait.ac.in').length >= 8 && forEmail('cse010@ait.ac.in').length >= 15, 'Early/mid/late showcase attempt tendencies failed')
  assert(forEmail('me085@ait.ac.in').length >= 18, 'Unplaced showcase needs many attempts')
  assert(forEmail(manyRejectionsEmail).filter(application => application.finalStatus === 'rejected').length >= 8, 'Rejection showcase is incomplete')
  assert(forEmail('cse096@ait.ac.in').some(application => application.finalStatus === 'absent'), 'Absent showcase is incomplete')
  assert(forEmail('bt039@ait.ac.in').some(application => application.finalStatus === 'withdrawn'), 'Withdrawn showcase is incomplete')
  assert(forEmail('cse012@ait.ac.in').filter(application => application.finalStatus === 'selected_pending_confirmation').length === 2, 'Two-offer selected journeys changed')
  assert(forEmail('it025@ait.ac.in').filter(application => application.finalStatus === 'selected_pending_confirmation').length === 3, 'Three-offer selected journeys changed')
  assert(forEmail('mi051@ait.ac.in').filter(application => application.finalStatus === 'selected_pending_confirmation').length === 0 || assignments.filter(item => item.studentId === lookupByEmail.get('mi051@ait.ac.in') && item.placementSource === 'OFF_CAMPUS').length > 0, 'Off-campus showcase lost its direct outcome')
  assert(forEmail('mi056@ait.ac.in').some(application => application.finalStatus === 'selected_pending_confirmation' && application.roleFamily === 'CORE'), 'Core Mining selected journey changed')
  assert(drives.length === 0 || drives.length === 207, `Expected 207 inspected drives, found ${drives.length}`)
  return {
    totalApplications: allApplications.length,
    unsuccessfulApplications: unsuccessful.length,
    phaseHistoryEvents: allApplications.reduce((sum, application) => sum + application.phaseHistory.length, 0),
    statuses: {
      selected: selected.length,
      rejected: unsuccessful.filter(application => application.finalStatus === 'rejected').length,
      absent: unsuccessful.filter(application => application.finalStatus === 'absent').length,
      withdrawn: unsuccessful.filter(application => application.finalStatus === 'withdrawn').length,
    },
  }
}

export async function loadHistoricalDrives({ driveModel = PlacementDrive } = {}) {
  const drives = await driveModel.find({ 'historicalSource.seedKey': seedKey }).select('_id publishedAt driveDetails.applicationDeadline eligibility.allowedBranches phases historicalSource').lean()
  assert(drives.length === 207, `Expected 207 live historical drives, found ${drives.length}`)
  drives.forEach(ensureUsableDrive)
  return drives
}

export async function buildApplicationGraphPlan({ write = true, drives = null, dependencies } = {}) {
  const [roster, assignmentsInput, selectedPlan, canonical] = await Promise.all([rosterPath, assignmentsPath, selectedPath, canonicalPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const liveDrives = drives ?? await loadHistoricalDrives(dependencies)
  const driveById = new Map(liveDrives.map(drive => [String(drive._id), drive]))
  const allStudents = [...roster.placedStudents.map(student => ({ ...student, unplaced: false })), ...roster.unplacedStudents.map(student => ({ ...student, unplaced: true }))]
  const selectedByStudent = Map.groupBy(selectedPlan.applications, application => application.studentId)
  const placementLocks = placementLockByStudent(assignmentsInput.assignments)
  const forcedDriveIds = new Map(allStudents.map(student => [student.studentId, new Set()]))
  const unplacedStudents = allStudents.filter(student => student.unplaced)
  const zeroDrives = liveDrives.filter(drive => Object.values(drive.historicalSource.rawBranchOffers ?? {}).reduce((sum, count) => sum + count, 0) === 0)
  for (const drive of zeroDrives) {
    const eligible = ordered(unplacedStudents.filter(student => drive.eligibility.allowedBranches.includes(fullBranch[student.branch])), student => `${drive._id}:${student.studentId}`)
    assert(eligible.length >= 4, `Zero-selection drive ${drive.historicalSource.sourceRow} lacks enough unplaced eligible students`)
    eligible.slice(0, 4).forEach(student => forcedDriveIds.get(student.studentId).add(String(drive._id)))
  }

  const unsuccessfulApplications = []
  for (const student of ordered(allStudents, item => item.email)) {
    const selected = selectedByStudent.get(student.studentId) ?? []
    const selectedDriveIds = new Set(selected.map(application => application.driveId))
    const lockDate = placementLocks.get(student.studentId) ?? '2026-12-31'
    const legalDrives = liveDrives.filter(drive => drive.eligibility.allowedBranches.includes(fullBranch[student.branch]) && new Date(drive.publishedAt) <= new Date(`${lockDate}T23:59:59.999Z`) && !selectedDriveIds.has(String(drive._id)))
    const forced = [...forcedDriveIds.get(student.studentId)].map(driveId => driveById.get(driveId)).filter(Boolean)
    const desired = Math.max(targetAttempts(student, selected.length), selected.length + forced.length)
    const chosen = [...forced, ...ordered(legalDrives.filter(drive => !forcedDriveIds.get(student.studentId).has(String(drive._id))), drive => `${student.studentId}:${drive._id}`)].slice(0, Math.max(0, desired - selected.length))
    for (const drive of chosen) {
      const index = unsuccessfulApplications.filter(application => application.studentId === student.studentId).length
      const outcome = outcomeFor(student, index)
      const applicationKey = `unsuccessful:${student.studentId}:${drive._id}`
      const submittedAt = applicationSubmittedAt(drive, lockDate, applicationKey)
      unsuccessfulApplications.push({
        applicationKey,
        studentId: student.studentId,
        rollNumber: student.rollNumber,
        driveId: String(drive._id),
        sourceRow: drive.historicalSource.sourceRow,
        applicationSubmittedAt: iso(submittedAt),
        applicationOpenAt: iso(drive.publishedAt),
        applicationDeadline: iso(drive.driveDetails.applicationDeadline),
        firstPlacementConfirmationDate: lockDate,
        phaseIds: drive.phases.map(phase => phase.phaseNumber),
        phaseHistory: phaseHistoryForOutcome({ drive, submittedAt, outcome }),
        finalStatus: outcome,
        finalPhase: undefined,
        roleFamily: canonical.processes.find(process => process.sourceRow === drive.historicalSource.sourceRow)?.roleFamily,
      })
    }
  }
  const selectedNormalized = selectedPlan.applications.map(application => ({ ...application, driveId: String(application.driveId) }))
  const allApplications = [...selectedNormalized, ...unsuccessfulApplications]
  const driveFunnels = liveDrives.map(drive => funnelFor(drive, allApplications.filter(application => application.driveId === String(drive._id)))).sort((a, b) => a.sourceRow - b.sourceRow)
  const plan = {
    seedKey,
    selectedApplicationsReference: 'backend/data/historical-2025-26-selected-applications.json',
    selectedApplicationCount: selectedPlan.applications.length,
    unsuccessfulApplications: unsuccessfulApplications.sort((a, b) => a.applicationKey.localeCompare(b.applicationKey)),
    driveFunnels,
  }
  const validation = validateApplicationGraphPlan({ roster, assignments: assignmentsInput.assignments, selectedPlan, canonical, plan, drives: liveDrives })
  if (write) await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`)
  return { plan, validation }
}

if (process.argv[1]?.endsWith('historical-application-graph-plan-builder.js')) {
  try {
    await connectDatabase()
    const { validation } = await buildApplicationGraphPlan()
    console.info(JSON.stringify(validation, null, 2))
  } catch (error) {
    console.error('Historical application graph plan failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDatabase()
  }
}
