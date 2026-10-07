import bcrypt from 'bcryptjs'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { User } from '../src/modules/auth/auth.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { getActivePolicy } from '../src/modules/student-policy/student-policy.service.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { HISTORICAL_SEED_KEY, HistoricalSeedManifest } from './historical-seed-manifest.js'
import { loadHistoricalCanonicalInput } from './historical-seed-foundation.js'
import { buildHistoricalStudents, HISTORICAL_DEMO_PASSWORD } from './historical-student-foundation.js'

export async function seedHistoricalStudents() {
  const existing = await HistoricalSeedManifest.findOne({ seedKey: HISTORICAL_SEED_KEY })
  if (existing?.studentUserIds?.length) {
    if (existing.status === 'ready') return { status: 'already_seeded', students: existing.studentUserIds.length }
    throw new Error('A partial historical student seed exists. Reset its manifest-owned records before retrying.')
  }
  if (existing) throw new Error('A historical manifest already exists without student ownership. Resolve it with the historical reset before seeding.')
  const [{ hash: canonicalInputHash }, policy] = await Promise.all([loadHistoricalCanonicalInput(), getActivePolicy()])
  const students = buildHistoricalStudents()
  const emails = students.map(student => student.email)
  const rolls = students.map(student => student.rollNumber)
  const [emailCollision, rollCollision] = await Promise.all([User.findOne({ email: { $in: emails } }).select('_id email').lean(), StudentProfile.findOne({ rollNumber: { $in: rolls } }).select('_id rollNumber').lean()])
  if (emailCollision) throw new Error(`Historical seed email collides with an existing account: ${emailCollision.email}`)
  if (rollCollision) throw new Error(`Historical seed roll collides with an existing profile: ${rollCollision.rollNumber}`)
  const manifest = await HistoricalSeedManifest.create({ seedKey: HISTORICAL_SEED_KEY, status: 'seeding', canonicalInputHash })
  let users = []
  try {
    const passwordHash = await bcrypt.hash(HISTORICAL_DEMO_PASSWORD, env.BCRYPT_SALT_ROUNDS)
    users = await User.insertMany(students.map(student => ({ name: student.name, email: student.email, passwordHash, role: 'student' })), { ordered: true })
    const profiles = await StudentProfile.insertMany(students.map((student, index) => ({ userId: users[index]._id, branch: student.branch, graduationYear: 2026, cgpa: student.cgpa, activeBacklogs: 0, rollNumber: student.rollNumber, verificationStatus: 'verified', class10: { board: 'CBSE', schoolName: 'Synthetic Historical School', passingYear: 2022, score: student.class10Score }, class12: { board: 'CBSE', schoolName: 'Synthetic Historical School', passingYear: 2024, score: student.class12Score }, semesterSpis: [{ semester: 1, spi: Math.max(6, Number((student.cgpa - 0.15).toFixed(2))) }, { semester: 2, spi: student.cgpa }], skills: student.skills, skillGroups: [{ name: 'Branch skills', skills: student.skills }] })), { ordered: true })
    const acceptances = await StudentPolicyAcceptance.insertMany(users.map(user => ({ studentId: user._id, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date('2026-03-31T12:00:00.000Z') })), { ordered: true })
    manifest.studentUserIds = users.map(user => user._id)
    manifest.studentProfileIds = profiles.map(profile => profile._id)
    manifest.studentPolicyAcceptanceIds = acceptances.map(acceptance => acceptance._id)
    manifest.status = 'ready'
    await manifest.save()
    return { status: 'seeded', students: users.length, profiles: profiles.length, policyAcceptances: acceptances.length, manifestId: manifest._id }
  } catch (error) {
    const userIds = users.map(user => user._id)
    if (userIds.length) { await StudentPolicyAcceptance.deleteMany({ studentId: { $in: userIds } }); await StudentProfile.deleteMany({ userId: { $in: userIds } }); await User.deleteMany({ _id: { $in: userIds } }) }
    await HistoricalSeedManifest.deleteOne({ _id: manifest._id })
    throw error
  }
}

try { await connectDatabase(); console.info(JSON.stringify(await seedHistoricalStudents(), null, 2)) } catch (error) { console.error('Historical student seed failed:', error.message); process.exitCode = 1 } finally { await disconnectDatabase() }
