import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { User } from '../src/modules/auth/auth.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { HISTORICAL_SEED_KEY, HistoricalSeedManifest } from './historical-seed-manifest.js'

export const rosterBranchOrder = ['Biomedical', 'Biotechnology', 'Chemical', 'Civil', 'CSE', 'Electrical', 'ECE', 'IT', 'Mechanical', 'Metallurgical', 'Mining']

const profileBranchByRosterBranch = {
  Biomedical: 'Biomedical Engineering',
  Biotechnology: 'Biotechnology',
  Chemical: 'Chemical Engineering',
  Civil: 'Civil Engineering',
  CSE: 'Computer Science and Engineering',
  Electrical: 'Electrical Engineering',
  ECE: 'Electronics and Communication Engineering',
  IT: 'Information Technology',
  Mechanical: 'Mechanical Engineering',
  Metallurgical: 'Metallurgical and Materials Engineering',
  Mining: 'Mining Engineering',
}

export const placedTargets = {
  Biomedical: 9,
  Biotechnology: 21,
  Chemical: 55,
  Civil: 56,
  CSE: 70,
  Electrical: 90,
  ECE: 50,
  IT: 77,
  Mechanical: 76,
  Metallurgical: 68,
  Mining: 55,
}

const eligibleTargets = {
  Biomedical: 32,
  Biotechnology: 36,
  Chemical: 63,
  Civil: 57,
  CSE: 92,
  Electrical: 100,
  ECE: 100,
  IT: 105,
  Mechanical: 87,
  Metallurgical: 90,
  Mining: 82,
}

export const extraOfferTargets = {
  Biomedical: 0,
  Biotechnology: 3,
  Chemical: 8,
  Civil: 6,
  CSE: 15,
  Electrical: 6,
  ECE: 7,
  IT: 11,
  Mechanical: 12,
  Metallurgical: 6,
  Mining: 4,
}

const showcase = {
  'cse012@ait.ac.in': 'two_offers',
  'it025@ait.ac.in': 'three_offers_high_package',
  'mi051@ait.ac.in': 'off_campus_placed',
  'mi056@ait.ac.in': 'core_branch_placed',
  'bt006@ait.ac.in': 'early_placed',
  'ee109@ait.ac.in': 'mid_placed',
  'cse010@ait.ac.in': 'late_placed',
}

const unplacedEmail = 'me085@ait.ac.in'
const twoOfferEmail = 'cse012@ait.ac.in'
const threeOfferEmail = 'it025@ait.ac.in'

function digest(value) {
  return createHash('sha256').update(`${HISTORICAL_SEED_KEY}:${value}`).digest('hex')
}

function branchForProfile(profileBranch) {
  return Object.entries(profileBranchByRosterBranch).find(([, value]) => value === profileBranch)?.[0] ?? null
}

function deterministicStudentOrder(a, b) {
  // The hash supplies broad variation while the small CPI component gives a
  // modest preference without turning this into a top-CPI roster.
  const aScore = Number.parseInt(digest(`roster:${a.email}`).slice(0, 8), 16) - Math.round((a.cgpa ?? 0) * 300)
  const bScore = Number.parseInt(digest(`roster:${b.email}`).slice(0, 8), 16) - Math.round((b.cgpa ?? 0) * 300)
  return aScore - bScore || a.rollNumber.localeCompare(b.rollNumber)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function byBranch(records) {
  return Object.fromEntries(rosterBranchOrder.map(branch => [branch, records.filter(record => record.branch === branch)]))
}

export function validatePlacedStudentRoster(output, { students } = {}) {
  const placed = output.placedStudents
  const unplaced = output.unplacedStudents
  const allRosterIds = [...placed, ...unplaced].map(student => student.studentId)
  assert(placed.length === 627, `Expected 627 placed students, found ${placed.length}`)
  assert(unplaced.length === 217, `Expected 217 unplaced students, found ${unplaced.length}`)
  assert(new Set(allRosterIds).size === 844, 'Roster contains a duplicate student ID')
  assert(allRosterIds.length === 844, 'Roster does not account for exactly 844 students')
  if (students) {
    assert(students.length === 844, `Expected 844 live historical students, found ${students.length}`)
    const validIds = new Set(students.map(student => student.studentId))
    assert(allRosterIds.every(studentId => validIds.has(studentId)), 'Roster contains an invalid student ID')
  }

  const placedByBranch = byBranch(placed)
  for (const branch of rosterBranchOrder) {
    assert(placedByBranch[branch].length === placedTargets[branch], `${branch} placed target mismatch`)
    const expectedTwoOffer = branch === 'IT' ? 9 : extraOfferTargets[branch]
    assert(placedByBranch[branch].filter(student => student.plannedOfferCount === 2).length === expectedTwoOffer, `${branch} two-offer quota mismatch`)
  }
  const distribution = [1, 2, 3].map(count => placed.filter(student => student.plannedOfferCount === count).length)
  assert(distribution[0] === 550 && distribution[1] === 76 && distribution[2] === 1, `Offer-count distribution mismatch: ${distribution.join('/')}`)
  assert(placed.reduce((sum, student) => sum + student.plannedOfferCount, 0) === 705, 'Planned offer total must equal 705')

  const byEmail = new Map(placed.map(student => [student.email, student]))
  assert(!byEmail.has(unplacedEmail), 'me085@ait.ac.in must remain unplaced')
  assert(byEmail.get(twoOfferEmail)?.plannedOfferCount === 2, 'cse012@ait.ac.in must have two planned offers')
  assert(byEmail.get(threeOfferEmail)?.plannedOfferCount === 3, 'it025@ait.ac.in must have three planned offers')
  assert(unplaced.some(student => student.email === unplacedEmail), 'me085@ait.ac.in must be present in the unplaced roster')
  return { placedByBranch: Object.fromEntries(rosterBranchOrder.map(branch => [branch, placedByBranch[branch].length])), distribution: { oneOffer: distribution[0], twoOffers: distribution[1], threeOffers: distribution[2] } }
}

export function buildPlacedStudentRoster(students) {
  assert(students.length === 844, `Expected exactly 844 historical students, found ${students.length}`)
  const liveByEmail = new Map(students.map(student => [student.email, student]))
  for (const email of [...Object.keys(showcase), unplacedEmail]) assert(liveByEmail.has(email), `Required showcase account is missing: ${email}`)

  const placedStudents = []
  for (const branch of rosterBranchOrder) {
    const branchStudents = students.filter(student => student.branch === branch)
    const requiredEmails = Object.keys(showcase).filter(email => liveByEmail.get(email).branch === branch)
    const candidates = branchStudents.filter(student => student.email !== unplacedEmail).sort(deterministicStudentOrder)
    const required = requiredEmails.map(email => liveByEmail.get(email))
    const requiredIds = new Set(required.map(student => student.studentId))
    const selected = [...required, ...candidates.filter(student => !requiredIds.has(student.studentId))].slice(0, placedTargets[branch])
    assert(selected.length === placedTargets[branch], `Insufficient ${branch} students for the placed roster`)

    const twoOfferCount = branch === 'IT' ? 9 : extraOfferTargets[branch]
    const forcedTwoOffer = branch === 'CSE' ? [liveByEmail.get(twoOfferEmail)] : []
    const rankedForExtras = [...selected].sort((a, b) => digest(`extras:${a.email}`).localeCompare(digest(`extras:${b.email}`)))
    const forcedIds = new Set(forcedTwoOffer.map(student => student.studentId))
    const twoOfferStudents = [...forcedTwoOffer, ...rankedForExtras.filter(student => !forcedIds.has(student.studentId) && student.email !== threeOfferEmail).slice(0, twoOfferCount - forcedTwoOffer.length)]
    assert(twoOfferStudents.length === twoOfferCount, `Unable to allocate ${branch} two-offer quota`)
    const twoOfferIds = new Set(twoOfferStudents.map(student => student.studentId))

    for (const student of selected) {
      const plannedOfferCount = student.email === threeOfferEmail ? 3 : twoOfferIds.has(student.studentId) ? 2 : 1
      placedStudents.push({
        studentId: student.studentId,
        rollNumber: student.rollNumber,
        email: student.email,
        branch: student.branch,
        plannedOfferCount,
        ...(showcase[student.email] ? { showcaseTag: showcase[student.email] } : {}),
      })
    }
  }
  const placedIds = new Set(placedStudents.map(student => student.studentId))
  const unplacedStudents = students.filter(student => !placedIds.has(student.studentId)).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)).map(student => ({ studentId: student.studentId, rollNumber: student.rollNumber, email: student.email, branch: student.branch }))
  const output = {
    seedKey: HISTORICAL_SEED_KEY,
    placedStudents: placedStudents.sort((a, b) => rosterBranchOrder.indexOf(a.branch) - rosterBranchOrder.indexOf(b.branch) || a.rollNumber.localeCompare(b.rollNumber)),
    unplacedStudents,
  }
  validatePlacedStudentRoster(output, { students })
  return output
}

export async function loadLiveHistoricalStudents({ userModel = User, profileModel = StudentProfile, manifestModel = HistoricalSeedManifest } = {}) {
  const manifest = await manifestModel.findOne({ seedKey: HISTORICAL_SEED_KEY }).select('studentUserIds').lean()
  assert(manifest?.studentUserIds?.length === 844, 'Historical seed manifest must own exactly 844 student users')
  const userIds = manifest.studentUserIds.map(String)
  const [users, profiles] = await Promise.all([
    userModel.find({ _id: { $in: userIds }, role: 'student' }).select('_id email').lean(),
    profileModel.find({ userId: { $in: userIds } }).select('userId branch rollNumber cgpa graduationYear activeBacklogs verificationStatus').lean(),
  ])
  assert(users.length === 844, `Expected 844 live historical student users, found ${users.length}`)
  assert(profiles.length === 844, `Expected 844 live historical student profiles, found ${profiles.length}`)
  const userById = new Map(users.map(user => [String(user._id), user]))
  const students = profiles.map(profile => {
    const user = userById.get(String(profile.userId))
    assert(user, `Historical student profile ${profile._id} has no owned user`)
    const branch = branchForProfile(profile.branch)
    assert(branch, `Unsupported historical profile branch: ${profile.branch}`)
    assert(profile.verificationStatus === 'verified' && profile.activeBacklogs === 0 && profile.cgpa >= 6, `Historical student ${user.email} is not eligible`)
    return { studentId: String(profile.userId), rollNumber: profile.rollNumber, email: user.email, branch, cgpa: profile.cgpa }
  })
  for (const branch of rosterBranchOrder) {
    assert(students.filter(student => student.branch === branch).length === eligibleTargets[branch], `Live ${branch} eligible-student count does not match the historical target`)
  }
  return students
}

export async function writePlacedStudentRoster({ write = true, dependencies } = {}) {
  const students = await loadLiveHistoricalStudents(dependencies)
  const output = buildPlacedStudentRoster(students)
  if (write) await writeFile(new URL('../data/historical-2025-26-placed-students.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
  return output
}

if (process.argv[1]?.endsWith('historical-placed-student-roster.js')) {
  try {
    await connectDatabase()
    const output = await writePlacedStudentRoster()
    const validation = validatePlacedStudentRoster(output)
    console.info(JSON.stringify({ placed: output.placedStudents.length, unplaced: output.unplacedStudents.length, ...validation }, null, 2))
  } catch (error) {
    console.error('Historical placed-student roster failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDatabase()
  }
}
