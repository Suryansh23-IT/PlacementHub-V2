import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const seedKey = 'NITR-PLACEMENT-2025-26'
const branchOrder = ['Biomedical', 'Biotechnology', 'Chemical', 'Civil', 'CSE', 'Electrical', 'ECE', 'IT', 'Mechanical', 'Metallurgical', 'Mining']
const branchOfferTargets = { Biomedical: 9, Biotechnology: 24, Chemical: 63, Civil: 62, CSE: 85, Electrical: 96, ECE: 57, IT: 88, Mechanical: 88, Metallurgical: 74, Mining: 59 }

const slotsPath = new URL('../data/historical-2025-26-offer-slots.json', import.meta.url)
const rosterPath = new URL('../data/historical-2025-26-placed-students.json', import.meta.url)
const canonicalPath = new URL('../data/historical-2025-26.json', import.meta.url)
const outputPath = new URL('../data/historical-2025-26-offer-assignments.json', import.meta.url)

function hash(value) {
  return createHash('sha256').update(`${seedKey}:${value}`).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sortSlots(slots) {
  return [...slots].sort((a, b) => hash(`slot:${a.offerSlotId}`).localeCompare(hash(`slot:${b.offerSlotId}`)) || a.offerSlotId.localeCompare(b.offerSlotId))
}

function sortStudents(students) {
  return [...students].sort((a, b) => hash(`student:${a.email}`).localeCompare(hash(`student:${b.email}`)) || a.rollNumber.localeCompare(b.rollNumber))
}

function buildRecord(slot, student, offerSequence) {
  return {
    offerSlotId: slot.offerSlotId,
    studentId: student.studentId,
    rollNumber: student.rollNumber,
    branch: student.branch,
    offerSequence,
    sourceRow: slot.sourceRow,
    driveId: slot.driveId,
    placementSource: slot.placementSource,
  }
}

function takeReservedSlot({ student, predicate, availableSlots, assignedRows, assignments }) {
  const slot = availableSlots.find(candidate => predicate(candidate) && !assignedRows.get(student.studentId).has(candidate.sourceRow))
  assert(slot, `No valid reserved slot available for ${student.email}`)
  const index = availableSlots.indexOf(slot)
  availableSlots.splice(index, 1)
  assignedRows.get(student.studentId).add(slot.sourceRow)
  assignments.push(buildRecord(slot, student, assignments.filter(assignment => assignment.studentId === student.studentId).length + 1))
}

function mapBranch({ branch, slots, students, processesByRow }) {
  const availableSlots = sortSlots(slots)
  const remainingQuota = new Map(students.map(student => [student.studentId, student.plannedOfferCount]))
  const assignedRows = new Map(students.map(student => [student.studentId, new Set()]))
  const assignments = []
  const byEmail = new Map(students.map(student => [student.email, student]))

  const reserve = (email, predicate) => {
    const student = byEmail.get(email)
    if (!student) return
    takeReservedSlot({ student, predicate, availableSlots, assignedRows, assignments })
    remainingQuota.set(student.studentId, remainingQuota.get(student.studentId) - 1)
  }

  if (branch === 'IT') {
    const highestCtc = Math.max(...availableSlots.map(slot => slot.ctc ?? -1))
    reserve('it025@ait.ac.in', slot => slot.ctc === highestCtc)
  }
  if (branch === 'Mining') {
    reserve('mi051@ait.ac.in', slot => slot.placementSource === 'OFF_CAMPUS')
    reserve('mi056@ait.ac.in', slot => slot.placementSource === 'ON_CAMPUS' && processesByRow.get(slot.sourceRow)?.roleFamily === 'CORE')
  }

  // Allocate the multi-offer positions first. This preserves scarce distinct
  // process rows for the students that must receive two or three offers.
  const positions = sortStudents(students).flatMap(student => Array.from({ length: remainingQuota.get(student.studentId) }, () => student))
    .sort((a, b) => remainingQuota.get(b.studentId) - remainingQuota.get(a.studentId) || hash(`position:${a.email}`).localeCompare(hash(`position:${b.email}`)))
  for (const student of positions) {
    const slot = availableSlots.find(candidate => !assignedRows.get(student.studentId).has(candidate.sourceRow))
    assert(slot, `Unable to finish the ${branch} mapping without duplicate source-row offers`)
    const index = availableSlots.indexOf(slot)
    availableSlots.splice(index, 1)
    assignedRows.get(student.studentId).add(slot.sourceRow)
    assignments.push(buildRecord(slot, student, assignments.filter(assignment => assignment.studentId === student.studentId).length + 1))
    remainingQuota.set(student.studentId, remainingQuota.get(student.studentId) - 1)
  }
  assert(availableSlots.length === 0, `${branch} has unused offer slots after mapping`)
  return assignments
}

export function validateOfferAssignments({ slots, roster, canonical, output }) {
  const assignments = output.assignments
  const placed = roster.placedStudents
  const unplaced = roster.unplacedStudents
  assert(slots.length === 705, `Expected 705 offer slots, found ${slots.length}`)
  assert(assignments.length === 705, `Expected 705 assignments, found ${assignments.length}`)
  assert(new Set(assignments.map(assignment => assignment.offerSlotId)).size === 705, 'An offer slot is assigned more than once')
  assert(new Set(slots.map(slot => slot.offerSlotId)).size === 705, 'Offer slot input contains duplicate IDs')
  const slotsById = new Map(slots.map(slot => [slot.offerSlotId, slot]))
  assert(assignments.every(assignment => slotsById.has(assignment.offerSlotId)), 'An assignment references an unknown offer slot')
  const placedById = new Map(placed.map(student => [student.studentId, student]))
  assert(assignments.every(assignment => placedById.has(assignment.studentId)), 'An assignment references an unknown student')
  assert(!assignments.some(assignment => assignment.studentId === unplaced.find(student => student.email === 'me085@ait.ac.in')?.studentId), 'me085@ait.ac.in must have no assignments')

  for (const assignment of assignments) {
    const slot = slotsById.get(assignment.offerSlotId)
    const student = placedById.get(assignment.studentId)
    assert(assignment.branch === slot.branch && assignment.branch === student.branch, `Branch mismatch for ${assignment.offerSlotId}`)
    assert(assignment.sourceRow === slot.sourceRow && assignment.driveId === slot.driveId && assignment.placementSource === slot.placementSource, `Slot reference mismatch for ${assignment.offerSlotId}`)
  }
  const assignmentsByStudent = new Map(placed.map(student => [student.studentId, []]))
  for (const assignment of assignments) assignmentsByStudent.get(assignment.studentId).push(assignment)
  for (const student of placed) {
    const studentAssignments = assignmentsByStudent.get(student.studentId)
    assert(studentAssignments.length === student.plannedOfferCount, `${student.email} does not have its planned offer count`)
    assert(new Set(studentAssignments.map(assignment => assignment.sourceRow)).size === studentAssignments.length, `${student.email} has multiple offers from the same source row`)
    assert(new Set(studentAssignments.map(assignment => assignment.driveId ?? `off-campus:${assignment.sourceRow}`)).size === studentAssignments.length, `${student.email} has multiple offers from the same drive`)
    assert(new Set(studentAssignments.map(assignment => assignment.offerSequence)).size === studentAssignments.length, `${student.email} has duplicate offer sequence values`)
  }
  const offerDistribution = [1, 2, 3].map(count => placed.filter(student => assignmentsByStudent.get(student.studentId).length === count).length)
  assert(offerDistribution[0] === 550 && offerDistribution[1] === 76 && offerDistribution[2] === 1, `Offer distribution mismatch: ${offerDistribution.join('/')}`)
  assert(new Set(assignments.map(assignment => assignment.studentId)).size === 627, 'Expected exactly 627 assigned students')
  assert(unplaced.length === 217, 'Expected exactly 217 unplaced students')
  for (const branch of branchOrder) assert(assignments.filter(assignment => assignment.branch === branch).length === branchOfferTargets[branch], `${branch} offer total mismatch`)

  const byEmail = new Map(placed.map(student => [student.email, student]))
  const studentAssignmentsFor = email => assignmentsByStudent.get(byEmail.get(email).studentId)
  const itAssignments = studentAssignmentsFor('it025@ait.ac.in')
  const maxItCtc = Math.max(...slots.filter(slot => slot.branch === 'IT').map(slot => slot.ctc ?? -1))
  assert(itAssignments.length === 3 && itAssignments.some(assignment => slotsById.get(assignment.offerSlotId).ctc === maxItCtc), 'it025@ait.ac.in must have three offers including the highest IT package')
  assert(studentAssignmentsFor('cse012@ait.ac.in').length === 2, 'cse012@ait.ac.in must have two offers')
  assert(studentAssignmentsFor('mi051@ait.ac.in').some(assignment => assignment.branch === 'Mining' && assignment.placementSource === 'OFF_CAMPUS'), 'mi051@ait.ac.in needs an off-campus Mining offer')
  const processesByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  assert(studentAssignmentsFor('mi056@ait.ac.in').some(assignment => assignment.branch === 'Mining' && assignment.placementSource === 'ON_CAMPUS' && processesByRow.get(assignment.sourceRow)?.roleFamily === 'CORE'), 'mi056@ait.ac.in needs an on-campus CORE Mining offer')
  return { distribution: { oneOffer: offerDistribution[0], twoOffers: offerDistribution[1], threeOffers: offerDistribution[2] }, branchTotals: Object.fromEntries(branchOrder.map(branch => [branch, assignments.filter(assignment => assignment.branch === branch).length])) }
}

export function buildOfferAssignments({ slots, roster, canonical }) {
  assert(slots.seedKey === seedKey && roster.seedKey === seedKey && canonical.metadata.seedKey === seedKey, 'Historical source files must use the expected seed key')
  const processesByRow = new Map(canonical.processes.map(process => [process.sourceRow, process]))
  const assignments = branchOrder.flatMap(branch => mapBranch({
    branch,
    slots: slots.slots.filter(slot => slot.branch === branch),
    students: roster.placedStudents.filter(student => student.branch === branch),
    processesByRow,
  }))
  const output = { seedKey, assignments: assignments.sort((a, b) => a.offerSlotId.localeCompare(b.offerSlotId)) }
  validateOfferAssignments({ slots: slots.slots, roster, canonical, output })
  return output
}

export async function writeOfferAssignments({ write = true } = {}) {
  const [slots, roster, canonical] = await Promise.all([slotsPath, rosterPath, canonicalPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const output = buildOfferAssignments({ slots, roster, canonical })
  if (write) await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  return output
}

if (process.argv[1]?.endsWith('historical-offer-assignment-builder.js')) {
  try {
    const output = await writeOfferAssignments()
    console.info(JSON.stringify({ assignments: output.assignments.length }, null, 2))
  } catch (error) {
    console.error('Historical offer assignment build failed:', error.message)
    process.exitCode = 1
  }
}
