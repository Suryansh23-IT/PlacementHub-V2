import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm3-student-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { ensureStudentProfile, resubmitStudentVerification, reviewStudentVerification, saveResume, updateStudentProfile } = await import('../src/modules/students/student.service.js')
const { studentProfileSchema, verificationSchema } = await import('../src/modules/students/student.validation.js')

function createProfileModel() {
  const profiles = []
  function makeProfile(input) {
    return { verificationStatus: 'pending', skills: [], projects: [], ...input, async save() { return this } }
  }
  return {
    profiles,
    async findOneAndUpdate(query, update) {
      let profile = profiles.find((item) => item.userId === query.userId)
      if (!profile) { profile = makeProfile(update.$setOnInsert ?? { userId: query.userId }); profiles.push(profile) }
      if (update.$set) Object.assign(profile, update.$set)
      return profile
    },
  }
}

function createStudentUserModel(studentId = 'student-1') {
  return {
    findOne(query) {
      const exists = query._id === studentId && query.role === USER_ROLES.STUDENT
      return { select: async () => exists ? { _id: studentId } : null }
    },
  }
}

test('student profile validation accepts academic details, skills, and projects while rejecting invalid values', () => {
  const valid = studentProfileSchema.safeParse({ branch: 'Computer Science', graduationYear: 2027, cgpa: 8.4, activeBacklogs: 0, skills: ['React'], projects: [{ title: 'Placement portal', description: 'A student project', technologies: ['React'], url: 'https://example.test/project' }] })
  assert.equal(valid.success, true)
  assert.equal(studentProfileSchema.safeParse({ branch: 'CS', graduationYear: 1999, cgpa: 11, activeBacklogs: -1 }).success, false)
})

test('student profiles are initialized pending and profile updates retain verification state', async () => {
  const profileModel = createProfileModel()
  const initial = await ensureStudentProfile('student-1', { profileModel })
  assert.equal(initial.verificationStatus, 'pending')
  const updated = await updateStudentProfile('student-1', { branch: 'IT', graduationYear: 2027, cgpa: 8.1, activeBacklogs: 0, skills: ['Node.js'], projects: [] }, { profileModel })
  assert.equal(updated.verificationStatus, 'pending')
  assert.equal(updated.branch, 'IT')
})

test('only valid pending-to-verified or rejected verification decisions are accepted', async () => {
  assert.equal(verificationSchema.safeParse({ status: 'rejected' }).success, false)
  assert.equal(verificationSchema.safeParse({ status: 'verified', rejectionReason: 'Not needed' }).success, false)
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, { branch: 'IT', graduationYear: 2027, cgpa: 8.1, activeBacklogs: 0, resume: { originalName: 'resume.pdf' } })
  const verified = await reviewStudentVerification('student-1', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(verified.verificationStatus, 'verified')
  assert.equal(verified.reviewedBy, 'admin-1')
  await assert.rejects(reviewStudentVerification('student-1', 'admin-2', { status: 'rejected', rejectionReason: 'Missing record' }, { userModel: createStudentUserModel(), profileModel }), { errorCode: 'CONFLICT' })
})

test('a student cannot be verified until academic details and a resume are present', async () => {
  await assert.rejects(
    reviewStudentVerification('student-1', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel: createProfileModel() }),
    { errorCode: 'CONFLICT' },
  )
})

test('a rejected student can correct and explicitly resubmit for a fresh pending review', async () => {
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, { branch: 'IT', graduationYear: 2027, cgpa: 8.1, activeBacklogs: 0, resume: { originalName: 'resume.pdf' } })
  const rejected = await reviewStudentVerification('student-1', 'admin-1', { status: 'rejected', rejectionReason: 'Please update your resume.' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(rejected.verificationStatus, 'rejected')
  const resubmitted = await resubmitStudentVerification('student-1', { profileModel })
  assert.equal(resubmitted.verificationStatus, 'pending')
  assert.equal(resubmitted.reviewedBy, undefined)
  assert.equal(resubmitted.reviewedAt, undefined)
  assert.equal(resubmitted.rejectionReason, undefined)
  const verified = await reviewStudentVerification('student-1', 'admin-2', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(verified.verificationStatus, 'verified')
  await assert.rejects(resubmitStudentVerification('student-1', { profileModel }), { errorCode: 'CONFLICT' })
})

test('invalid resume content is removed before it can be saved as metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-m3-'))
  const filePath = path.join(directory, 'not-a-pdf.pdf')
  await writeFile(filePath, 'not a PDF')
  try {
    await assert.rejects(saveResume('student-1', { originalname: 'not-a-pdf.pdf', path: filePath, mimetype: 'application/pdf', size: 9 }, { profileModel: createProfileModel() }), { errorCode: 'VALIDATION_ERROR' })
    await assert.rejects(readFile(filePath), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('student verification rejects missing student accounts', async () => {
  await assert.rejects(reviewStudentVerification('unknown', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel: createProfileModel() }), { errorCode: 'NOT_FOUND' })
})
