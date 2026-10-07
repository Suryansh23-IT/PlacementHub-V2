import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { buildOfferAssignments, validateOfferAssignments } from './historical-offer-assignment-builder.js'

const seedKey = 'NITR-PLACEMENT-2025-26'
const slotsPath = new URL('../data/historical-2025-26-offer-slots.json', import.meta.url)
const rosterPath = new URL('../data/historical-2025-26-placed-students.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)
const assignmentsPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hash(value) {
  return createHash('sha256').update(`${seedKey}:${value}`).digest('hex')
}

function plusDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function dateValue(value) {
  return new Date(`${value}T12:00:00.000Z`).valueOf()
}

function chronologyForSlot(slot, drive) {
  if (slot.placementSource === 'OFF_CAMPUS') {
    const syntheticReconstructionDate = plusDays(new Date('2026-04-27T12:00:00.000Z'), ((slot.sourceRow - 208) * 3) + (Number.parseInt(hash(slot.offerSlotId).slice(0, 4), 16) % 3))
    const plannedOfferDate = isoDate(syntheticReconstructionDate)
    return {
      plannedOfferDate,
      plannedConfirmationDate: isoDate(plusDays(syntheticReconstructionDate, Number.parseInt(hash(`confirmation:${slot.offerSlotId}`).slice(0, 4), 16) % 4)),
      syntheticReconstructionDate: plannedOfferDate,
      syntheticDate: true,
      applicationOpenAt: null,
      applicationDeadline: null,
      processEndDate: null,
    }
  }
  assert(drive, `On-campus slot ${slot.offerSlotId} has no historical drive`)
  const processEnd = drive.historicalSource.endDate ?? drive.historicalSource.startDate
  assert(processEnd && drive.publishedAt && drive.driveDetails?.applicationDeadline, `Historical drive timeline is incomplete for source row ${slot.sourceRow}`)
  const offerDate = plusDays(processEnd, Number.parseInt(hash(`offer:${slot.offerSlotId}`).slice(0, 4), 16) % 3)
  return {
    plannedOfferDate: isoDate(offerDate),
    plannedConfirmationDate: isoDate(plusDays(offerDate, Number.parseInt(hash(`confirmation:${slot.offerSlotId}`).slice(0, 4), 16) % 4)),
    syntheticDate: false,
    applicationOpenAt: isoDate(drive.publishedAt),
    applicationDeadline: isoDate(drive.driveDetails.applicationDeadline),
    processEndDate: isoDate(processEnd),
  }
}

function compareConfirmation(a, b) {
  return dateValue(a.plannedConfirmationDate) - dateValue(b.plannedConfirmationDate)
    || a.sourceRow - b.sourceRow
    || a.offerSlotId.localeCompare(b.offerSlotId)
}

function recordsByStudent(records) {
  return Map.groupBy(records, record => record.studentId)
}

function analyseChronology(records) {
  const groups = recordsByStudent(records)
  const primaries = new Map()
  const violations = []
  for (const [studentId, assignments] of groups) {
    const ranked = [...assignments].sort(compareConfirmation)
    const primary = ranked[0]
    primaries.set(studentId, primary)
    for (const assignment of ranked.slice(1)) {
      if (assignment.placementSource === 'ON_CAMPUS' && dateValue(assignment.applicationOpenAt) > dateValue(primary.plannedConfirmationDate)) {
        violations.push({ studentId, primaryOfferSlotId: primary.offerSlotId, additionalOfferSlotId: assignment.offerSlotId })
      }
    }
  }
  return { groups, primaries, violations }
}

function decorateAssignments(assignments, slotsById, driveById, processesByRow) {
  return assignments.map(assignment => {
    const slot = slotsById.get(assignment.offerSlotId)
    assert(slot, `Assignment references an unknown slot: ${assignment.offerSlotId}`)
    const chronology = chronologyForSlot(slot, driveById.get(slot.driveId))
    return { ...assignment, ...chronology, ctc: slot.ctc, roleFamily: processesByRow.get(slot.sourceRow)?.roleFamily }
  })
}

function protectedStudentIds(roster) {
  const protectedEmails = ['cse012@ait.ac.in', 'it025@ait.ac.in', 'mi051@ait.ac.in', 'mi056@ait.ac.in', 'bt006@ait.ac.in', 'ee109@ait.ac.in', 'cse010@ait.ac.in']
  const byEmail = new Map(roster.placedStudents.map(student => [student.email, student]))
  return new Set(protectedEmails.map(email => byEmail.get(email)?.studentId).filter(Boolean))
}

function swapStudentOwnership(left, right) {
  const leftStudent = { studentId: left.studentId, rollNumber: left.rollNumber }
  left.studentId = right.studentId
  left.rollNumber = right.rollNumber
  right.studentId = leftStudent.studentId
  right.rollNumber = leftStudent.rollNumber
}

function swapShowcaseTiming(records, roster, label, email, predicate, protectedIds) {
  const byEmail = new Map(roster.placedStudents.map(student => [student.email, student]))
  const student = byEmail.get(email)
  const target = records.find(record => record.studentId === student.studentId)
  assert(target, `Showcase ${email} has no offer assignment`)
  if (predicate(target)) return 0
  const groups = recordsByStudent(records)
  const candidate = records
    .filter(record => record.branch === target.branch && record.studentId !== target.studentId && !protectedIds.has(record.studentId) && predicate(record))
    .filter(record => !groups.get(record.studentId).some(other => other !== record && other.sourceRow === target.sourceRow))
    .sort((a, b) => hash(`${label}:${a.offerSlotId}`).localeCompare(hash(`${label}:${b.offerSlotId}`)))[0]
  assert(candidate, `No same-branch single-offer slot can satisfy ${label} showcase timing for ${email}`)
  swapStudentOwnership(target, candidate)
  return 1
}

function repairPlacementLocks(records, roster, slotsById, protectedIds) {
  let swaps = 0
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const analysis = analyseChronology(records)
    if (!analysis.violations.length) return swaps
    const violation = analysis.violations.sort((a, b) => hash(`violation:${a.additionalOfferSlotId}`).localeCompare(hash(`violation:${b.additionalOfferSlotId}`)))[0]
    const studentAssignments = analysis.groups.get(violation.studentId)
    const additional = studentAssignments.find(record => record.offerSlotId === violation.additionalOfferSlotId)
    const orderedCandidates = records
      .filter(record => record.branch === additional.branch && record.studentId !== additional.studentId && !protectedIds.has(record.studentId))
      .sort((a, b) => hash(`repair:${violation.additionalOfferSlotId}:${a.offerSlotId}`).localeCompare(hash(`repair:${violation.additionalOfferSlotId}:${b.offerSlotId}`)))
    const candidate = orderedCandidates.find(candidateRecord => {
      const candidateAssignments = analysis.groups.get(candidateRecord.studentId)
      if (studentAssignments.some(record => record !== additional && record.sourceRow === candidateRecord.sourceRow)) return false
      if (candidateAssignments.some(record => record !== candidateRecord && record.sourceRow === additional.sourceRow)) return false
      // A swap is accepted only when it strictly reduces the global number of
      // placement-lock violations. That keeps repair deterministic and avoids
      // moving an invalid later-starting campus process to another student.
      swapStudentOwnership(additional, candidateRecord)
      const reducesViolations = analyseChronology(records).violations.length < analysis.violations.length
      swapStudentOwnership(additional, candidateRecord)
      return reducesViolations
    })
    assert(candidate, `No same-branch single-offer swap can repair placement lock for ${additional.studentId} / ${additional.offerSlotId}`)
    swapStudentOwnership(additional, candidate)
    swaps += 1
  }
  throw new Error('Chronology repair exceeded its deterministic swap limit')
}

function isCompatibleOfferSet(records) {
  if (new Set(records.map(record => record.sourceRow)).size !== records.length) return false
  const primary = [...records].sort(compareConfirmation)[0]
  return records.every(record => record === primary || record.placementSource === 'OFF_CAMPUS' || dateValue(record.applicationOpenAt) <= dateValue(primary.plannedConfirmationDate))
}

function compatibleSet(available, count, requiredPredicate = null) {
  const ordered = [...available].sort((a, b) => hash(`cluster:${a.offerSlotId}`).localeCompare(hash(`cluster:${b.offerSlotId}`)))
  const combinations = []
  if (count === 2) {
    for (let first = 0; first < ordered.length; first += 1) for (let second = first + 1; second < ordered.length; second += 1) {
      const set = [ordered[first], ordered[second]]
      if ((!requiredPredicate || set.some(requiredPredicate)) && isCompatibleOfferSet(set)) combinations.push(set)
    }
  } else if (count === 3) {
    for (let first = 0; first < ordered.length; first += 1) for (let second = first + 1; second < ordered.length; second += 1) for (let third = second + 1; third < ordered.length; third += 1) {
      const set = [ordered[first], ordered[second], ordered[third]]
      if ((!requiredPredicate || set.some(requiredPredicate)) && isCompatibleOfferSet(set)) combinations.push(set)
    }
  }
  return combinations.sort((left, right) => {
    const leftDates = left.map(record => dateValue(record.plannedConfirmationDate))
    const rightDates = right.map(record => dateValue(record.plannedConfirmationDate))
    const leftSpan = Math.max(...leftDates) - Math.min(...leftDates)
    const rightSpan = Math.max(...rightDates) - Math.min(...rightDates)
    return leftSpan - rightSpan || left.map(record => record.offerSlotId).join(':').localeCompare(right.map(record => record.offerSlotId).join(':'))
  })[0] ?? null
}

function rebuildCompatibleOwnership(records, roster, earlyBoundary, lateBoundary) {
  const byEmail = new Map(roster.placedStudents.map(student => [student.email, student]))
  const byBranch = new Map()
  for (const record of records) {
    const copy = { ...record }
    delete copy.studentId
    delete copy.rollNumber
    byBranch.set(copy.branch, [...(byBranch.get(copy.branch) ?? []), copy])
  }
  const rebuilt = []
  const allocate = (student, record) => {
    const available = byBranch.get(student.branch)
    const index = available.indexOf(record)
    assert(index >= 0, `Attempted to allocate an unavailable slot to ${student.email}`)
    available.splice(index, 1)
    rebuilt.push({ ...record, studentId: student.studentId, rollNumber: student.rollNumber })
  }
  const reserve = (email, predicate) => {
    const student = byEmail.get(email)
    const record = byBranch.get(student.branch).filter(predicate).sort((a, b) => hash(`reserve:${email}:${a.offerSlotId}`).localeCompare(hash(`reserve:${email}:${b.offerSlotId}`)))[0]
    assert(record, `No slot can satisfy required chronology reservation for ${email}`)
    allocate(student, record)
  }

  reserve('bt006@ait.ac.in', record => record.placementSource === 'ON_CAMPUS' && dateValue(record.processEndDate) <= earlyBoundary)
  reserve('ee109@ait.ac.in', record => record.placementSource === 'ON_CAMPUS' && dateValue(record.processEndDate) > earlyBoundary && dateValue(record.processEndDate) < lateBoundary)
  reserve('cse010@ait.ac.in', record => record.placementSource === 'ON_CAMPUS' && dateValue(record.processEndDate) >= lateBoundary)
  reserve('mi051@ait.ac.in', record => record.placementSource === 'OFF_CAMPUS')
  reserve('mi056@ait.ac.in', record => record.placementSource === 'ON_CAMPUS' && record.roleFamily === 'CORE')

  for (const branch of [...byBranch.keys()].sort()) {
    const multiStudents = roster.placedStudents.filter(student => student.branch === branch && student.plannedOfferCount > 1)
      .sort((a, b) => (b.plannedOfferCount - a.plannedOfferCount) || hash(`multi:${a.email}`).localeCompare(hash(`multi:${b.email}`)))
    for (const student of multiStudents) {
      const requiredPredicate = student.email === 'it025@ait.ac.in'
        ? record => record.ctc === Math.max(...records.filter(candidate => candidate.branch === 'IT').map(candidate => candidate.ctc ?? -1))
        : null
      const set = compatibleSet(byBranch.get(branch), student.plannedOfferCount, requiredPredicate)
      assert(set, `No compatible ${student.plannedOfferCount}-offer chronology cluster for ${student.email}`)
      for (const record of set) allocate(student, record)
    }
  }
  for (const branch of [...byBranch.keys()].sort()) {
    const alreadyAssigned = new Set(rebuilt.map(record => record.studentId))
    const remainingStudents = roster.placedStudents.filter(student => student.branch === branch && !alreadyAssigned.has(student.studentId))
    const available = [...byBranch.get(branch)].sort((a, b) => hash(`single:${a.offerSlotId}`).localeCompare(hash(`single:${b.offerSlotId}`)))
    assert(available.length === remainingStudents.length, `Remaining ${branch} single-offer slot count does not reconcile`)
    remainingStudents.sort((a, b) => hash(`single-student:${a.email}`).localeCompare(hash(`single-student:${b.email}`))).forEach((student, index) => allocate(student, available[index]))
  }
  assert(rebuilt.length === records.length, 'Compatible chronology rebuild did not retain every offer slot')
  return rebuilt
}

function finaliseAssignments(records) {
  const analysis = analyseChronology(records)
  for (const assignments of analysis.groups.values()) {
    const ranked = [...assignments].sort(compareConfirmation)
    ranked.forEach((assignment, index) => {
      assignment.offerSequence = index + 1
      assignment.primaryOffer = index === 0
      assignment.additionalOffer = index !== 0
    })
  }
  return analysis
}

export function validateOfferChronology({ slots, roster, canonical, output, drives }) {
  validateOfferAssignments({ slots, roster, canonical, output })
  const records = output.assignments
  const analysis = analyseChronology(records)
  assert(analysis.groups.size === 627, `Expected 627 placed students, found ${analysis.groups.size}`)
  assert(records.filter(record => record.primaryOffer).length === 627, 'Expected exactly 627 primary offers')
  assert(records.filter(record => record.additionalOffer).length === 78, 'Expected exactly 78 additional offers')
  for (const assignments of analysis.groups.values()) {
    assert(assignments.filter(assignment => assignment.primaryOffer).length === 1, `Student ${assignments[0].studentId} does not have exactly one primary offer`)
    for (const assignment of assignments.filter(assignment => assignment.placementSource === 'ON_CAMPUS')) {
      assert(dateValue(assignment.plannedOfferDate) >= dateValue(assignment.processEndDate), `Offer precedes process completion for ${assignment.offerSlotId}`)
      assert(dateValue(assignment.plannedConfirmationDate) >= dateValue(assignment.plannedOfferDate), `Confirmation precedes offer for ${assignment.offerSlotId}`)
      assert(dateValue(assignment.applicationOpenAt) <= dateValue(assignment.applicationDeadline), `Invalid application window for ${assignment.offerSlotId}`)
    }
  }
  assert(analysis.violations.length === 0, `Placement-lock chronology violations remain: ${analysis.violations.length}`)
  const offCampus = records.filter(record => record.placementSource === 'OFF_CAMPUS')
  assert(offCampus.length === slots.filter(slot => slot.placementSource === 'OFF_CAMPUS').length && offCampus.every(record => record.syntheticDate && record.syntheticReconstructionDate), 'Off-campus synthetic chronology is incomplete')
  const onCampusEndDates = records.filter(record => record.placementSource === 'ON_CAMPUS').map(record => dateValue(record.processEndDate)).sort((a, b) => a - b)
  const earlyBoundary = onCampusEndDates[Math.floor(onCampusEndDates.length / 3)]
  const lateBoundary = onCampusEndDates[Math.floor((onCampusEndDates.length * 2) / 3)]
  const rosterByEmail = new Map(roster.placedStudents.map(student => [student.email, student]))
  const assignmentFor = email => records.find(record => record.studentId === rosterByEmail.get(email)?.studentId)
  assert(dateValue(assignmentFor('bt006@ait.ac.in').processEndDate) <= earlyBoundary, 'bt006@ait.ac.in must retain an early-season primary offer')
  assert(dateValue(assignmentFor('ee109@ait.ac.in').processEndDate) > earlyBoundary && dateValue(assignmentFor('ee109@ait.ac.in').processEndDate) < lateBoundary, 'ee109@ait.ac.in must retain a mid-season primary offer')
  assert(dateValue(assignmentFor('cse010@ait.ac.in').processEndDate) >= lateBoundary, 'cse010@ait.ac.in must retain a late-season primary offer')
  assert(drives.length === 207, `Expected 207 read-only historical drives, found ${drives.length}`)
  return { primaryOffers: 627, additionalOffers: 78, placementLockViolations: 0, offCampusSyntheticDates: offCampus.length }
}

export async function loadHistoricalDriveTimelines({ driveModel = PlacementDrive } = {}) {
  const drives = await driveModel.find({ 'historicalSource.seedKey': seedKey }).select('_id publishedAt driveDetails.applicationDeadline historicalSource').lean()
  assert(drives.length === 207, `Expected 207 historical drives, found ${drives.length}`)
  return drives
}

export async function buildOfferChronology({ write = true, drives = null, dependencies } = {}) {
  const [slotsInput, roster, canonical, assignmentInput] = await Promise.all([slotsPath, rosterPath, canonicalPath, assignmentsPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const readOnlyDrives = drives ?? await loadHistoricalDriveTimelines(dependencies)
  const driveById = new Map(readOnlyDrives.map(drive => [String(drive._id), drive]))
  const slotsById = new Map(slotsInput.slots.map(slot => [slot.offerSlotId, slot]))
  for (const slot of slotsInput.slots.filter(slot => slot.placementSource === 'ON_CAMPUS')) {
    const drive = driveById.get(slot.driveId)
    assert(drive?.historicalSource?.sourceRow === slot.sourceRow, `Offer slot ${slot.offerSlotId} does not resolve to its source-row drive`)
  }
  const processesByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  // Always rebuild the immutable Step 2 mechanical mapping in memory. The
  // persisted file is intentionally replaced by this chronology-enriched
  // mapping, so using it as the next run's baseline would hide the original
  // violations and make a rerun non-idempotent.
  validateOfferAssignments({ slots: slotsInput.slots, roster, canonical, output: assignmentInput })
  const mechanicalAssignment = buildOfferAssignments({ slots: slotsInput, roster, canonical })
  const records = decorateAssignments(mechanicalAssignment.assignments.map(assignment => ({ ...assignment })), slotsById, driveById, processesByRow)
  const initialViolations = analyseChronology(records).violations.length
  const allOnCampusEndDates = records.filter(record => record.placementSource === 'ON_CAMPUS').map(record => dateValue(record.processEndDate)).sort((a, b) => a - b)
  const earlyBoundary = allOnCampusEndDates[Math.floor(allOnCampusEndDates.length / 3)]
  const lateBoundary = allOnCampusEndDates[Math.floor((allOnCampusEndDates.length * 2) / 3)]
  const rebuiltRecords = rebuildCompatibleOwnership(records, roster, earlyBoundary, lateBoundary)
  const sameBranchOwnershipSwaps = rebuiltRecords.filter(record => mechanicalAssignment.assignments.find(initial => initial.offerSlotId === record.offerSlotId)?.studentId !== record.studentId).length
  finaliseAssignments(rebuiltRecords)
  for (const record of rebuiltRecords) {
    delete record.ctc
    delete record.roleFamily
  }
  const output = {
    seedKey,
    chronologyRepair: { initialPlacementLockViolations: initialViolations, sameBranchOwnershipSwaps },
    assignments: rebuiltRecords.sort((a, b) => a.offerSlotId.localeCompare(b.offerSlotId)),
  }
  const validation = validateOfferChronology({ slots: slotsInput.slots, roster, canonical, output, drives: readOnlyDrives })
  if (write) await writeFile(assignmentsPath, `${JSON.stringify(output, null, 2)}\n`)
  return { output, validation }
}

if (process.argv[1]?.endsWith('historical-offer-chronology-builder.js')) {
  try {
    await connectDatabase()
    const { output, validation } = await buildOfferChronology()
    console.info(JSON.stringify({ assignments: output.assignments.length, ...output.chronologyRepair, ...validation }, null, 2))
  } catch (error) {
    console.error('Historical offer chronology build failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDatabase()
  }
}
