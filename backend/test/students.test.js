import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm3-student-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { ensureStudentProfile, getAcademicMarksheet, getProfileCompletion, getStudentDocumentForAdmin, resubmitStudentVerification, reviewStudentVerification, saveAcademicMarksheet, saveResume, updateStudentProfile } = await import('../src/modules/students/student.service.js')
const { studentProfileSchema, verificationSchema } = await import('../src/modules/students/student.validation.js')
const { toProfileResponse } = await import('../src/modules/students/student.controller.js')

const completeProfileInput = {
  phone: '9876543210',
  rollNumber: 'IT-2027-001',
  branch: 'Information Technology',
  graduationYear: 2027,
  cgpa: 8.4,
  activeBacklogs: 0,
  class10: { board: 'CBSE', schoolName: 'Example School', passingYear: 2021, score: 91 },
  class12: { board: 'CBSE', schoolName: 'Example School', passingYear: 2023, score: 89 },
  semesterSpis: [{ semester: 1, spi: 8.3 }],
  skillGroups: [{ name: 'Programming', skills: ['JavaScript', 'Node.js'] }],
  skills: [],
  projects: [{ title: 'Placement portal', description: 'A placement management project', technologies: ['React'], url: 'https://example.test/project' }],
}

function completeProfile(overrides = {}) {
  return { ...completeProfileInput, resume: { originalName: 'resume.pdf' }, collegeResult: { originalName: 'college-result.pdf' }, ...overrides }
}

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
  return { findOne(query) { const exists = query._id === studentId && query.role === USER_ROLES.STUDENT; return { select: async () => exists ? { _id: studentId } : null } } }
}

const institutionService = async () => ({ branches: ['Information Technology', 'Computer Science and Engineering'] })

test('student profile validation accepts the complete richer profile and rejects invalid values', () => {
  assert.equal(studentProfileSchema.safeParse(completeProfileInput).success, true)
  assert.equal(studentProfileSchema.safeParse({ ...completeProfileInput, graduationYear: 1999, cgpa: 11, activeBacklogs: -1 }).success, false)
})

test('optional professional and coding links persist without affecting completion', () => {
  const input = { ...completeProfileInput, professionalLinks: { linkedin: 'https://linkedin.com/in/example', github: 'https://github.com/example', portfolio: 'https://example.test' }, codingProfiles: [{ platform: 'LeetCode', url: 'https://leetcode.com/example' }, { platform: 'CodeChef', url: 'https://www.codechef.com/users/example' }] }
  const parsed = studentProfileSchema.parse(input)
  assert.equal(parsed.codingProfiles.length, 2)
  assert.equal(getProfileCompletion(completeProfile({ ...parsed })).complete, true)
  assert.equal(studentProfileSchema.safeParse({ ...input, codingProfiles: Array.from({ length: 6 }, (_, index) => ({ platform: `Platform ${index}`, url: 'https://example.test' })) }).success, false)
})

test('completion requires a college result but does not require optional Class 10 or Class 12 marksheets', () => {
  const completion = getProfileCompletion(completeProfile())
  assert.equal(completion.complete, true)
  assert.equal(completion.checks.class10Marksheet, undefined)
  assert.equal(completion.checks.class12Marksheet, undefined)
  assert.equal(getProfileCompletion(completeProfile({ collegeResult: undefined })).complete, false)
})

test('complete student profile remains pending and a Placement Admin can verify it without optional marksheets', async () => {
  const profileModel = createProfileModel()
  const initial = await ensureStudentProfile('student-1', { profileModel })
  assert.equal(initial.verificationStatus, 'pending')
  const pending = await updateStudentProfile('student-1', completeProfileInput, { profileModel, institutionService })
  pending.resume = { originalName: 'resume.pdf' }
  pending.collegeResult = { originalName: 'college-result.pdf' }
  assert.equal(getProfileCompletion(pending).complete, true)
  const verified = await reviewStudentVerification('student-1', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(verified.verificationStatus, 'verified')
  assert.equal(verified.reviewedBy, 'admin-1')
})

test('a student without the required college result cannot bypass verification', async () => {
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, completeProfile({ collegeResult: undefined }))
  await assert.rejects(
    reviewStudentVerification('student-1', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel }),
    { errorCode: 'CONFLICT' },
  )
  assert.equal(profile.verificationStatus, 'pending')
})

test('only valid pending-to-verified or rejected verification decisions are accepted', async () => {
  assert.equal(verificationSchema.safeParse({ status: 'rejected' }).success, false)
  assert.equal(verificationSchema.safeParse({ status: 'verified', rejectionReason: 'Not needed' }).success, false)
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, completeProfile())
  const verified = await reviewStudentVerification('student-1', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(verified.verificationStatus, 'verified')
  await assert.rejects(reviewStudentVerification('student-1', 'admin-2', { status: 'rejected', rejectionReason: 'Missing record' }, { userModel: createStudentUserModel(), profileModel }), { errorCode: 'CONFLICT' })
})

test('a rejected complete student can explicitly resubmit for a fresh pending review', async () => {
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, completeProfile())
  const rejected = await reviewStudentVerification('student-1', 'admin-1', { status: 'rejected', rejectionReason: 'Please clarify your project.' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(rejected.verificationStatus, 'rejected')
  const resubmitted = await resubmitStudentVerification('student-1', { profileModel })
  assert.equal(resubmitted.verificationStatus, 'pending')
  assert.equal(resubmitted.reviewedBy, undefined)
  assert.equal(resubmitted.reviewedAt, undefined)
  assert.equal(resubmitted.rejectionReason, undefined)
})

test('verified placement-critical academic changes return the profile to pending for a fresh Admin review', async () => {
  const changes = [
    ['branch', (input) => ({ ...input, branch: 'Computer Science and Engineering' })],
    ['CPI/CGPA', (input) => ({ ...input, cgpa: 8.8 })],
    ['active backlogs', (input) => ({ ...input, activeBacklogs: 1 })],
    ['Class 10 record', (input) => ({ ...input, class10: { ...input.class10, score: 92 } })],
    ['Class 12 record', (input) => ({ ...input, class12: { ...input.class12, score: 90 } })],
    ['semester SPI', (input) => ({ ...input, semesterSpis: [{ semester: 1, spi: 8.7 }] })],
  ]

  for (const [label, change] of changes) {
    const profileModel = createProfileModel()
    const profile = await ensureStudentProfile('student-1', { profileModel })
    Object.assign(profile, completeProfile({ verificationStatus: 'verified', reviewedBy: 'admin-1', reviewedAt: new Date() }))
    const pending = await updateStudentProfile('student-1', change(completeProfileInput), { profileModel, institutionService })
    assert.equal(pending.verificationStatus, 'pending', `${label} should require fresh verification`)
    assert.equal(pending.reviewedBy, undefined)
    assert.equal(pending.reviewedAt, undefined)
  }
})

test('a verified placement-critical edit can be reviewed and verified again, while a phone-only edit remains verified', async () => {
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, completeProfile({ verificationStatus: 'verified', reviewedBy: 'admin-1', reviewedAt: new Date() }))

  const pending = await updateStudentProfile('student-1', { ...completeProfileInput, cgpa: 8.9 }, { profileModel, institutionService })
  assert.equal(pending.verificationStatus, 'pending')
  const reverified = await reviewStudentVerification('student-1', 'admin-2', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel })
  assert.equal(reverified.verificationStatus, 'verified')

  const contactOnly = await updateStudentProfile('student-1', { ...completeProfileInput, cgpa: 8.9, phone: '9123456789' }, { profileModel, institutionService })
  assert.equal(contactOnly.verificationStatus, 'verified')
})

test('replacing a verified student resume returns the profile to pending', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-resume-reverify-'))
  const filePath = path.join(directory, 'replacement.pdf')
  await writeFile(filePath, '%PDF-1.7\nreplacement')
  try {
    const profileModel = createProfileModel()
    const profile = await ensureStudentProfile('student-1', { profileModel })
    Object.assign(profile, completeProfile({ verificationStatus: 'verified', reviewedBy: 'admin-1', reviewedAt: new Date() }))
    const pending = await saveResume('student-1', { originalname: 'replacement.pdf', path: filePath, mimetype: 'application/pdf', size: 22 }, { profileModel })
    assert.equal(pending.verificationStatus, 'pending')
    assert.equal(pending.reviewedBy, undefined)
    assert.equal(pending.reviewedAt, undefined)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('replacing a verified college result returns the profile to pending', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-result-reverify-'))
  const filePath = path.join(directory, 'college-result.pdf')
  await writeFile(filePath, '%PDF-1.7\ncollege result')
  try {
    const profileModel = createProfileModel()
    const profile = await ensureStudentProfile('student-1', { profileModel })
    Object.assign(profile, completeProfile({ verificationStatus: 'verified', reviewedBy: 'admin-1', reviewedAt: new Date() }))
    const pending = await saveAcademicMarksheet('student-1', 'collegeResult', { originalname: 'college-result.pdf', path: filePath, mimetype: 'application/pdf', size: 22 }, { profileModel })
    assert.equal(pending.verificationStatus, 'pending')
    assert.equal(pending.reviewedBy, undefined)
    assert.equal(pending.reviewedAt, undefined)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('ordinary profile saves preserve optional marksheet metadata and all skill groups/projects', async () => {
  const profileModel = createProfileModel()
  const profile = await ensureStudentProfile('student-1', { profileModel })
  Object.assign(profile, completeProfile({
    class10: { ...completeProfileInput.class10, marksheet: { originalName: 'class10.pdf', storagePath: '/safe/class10.pdf' } },
    class12: { ...completeProfileInput.class12, marksheet: { originalName: 'class12.pdf', storagePath: '/safe/class12.pdf' } },
  }))
  const input = { ...completeProfileInput,
    skillGroups: [{ name: 'Programming', skills: ['JavaScript'] }, { name: 'Tools', skills: ['Git'] }, { name: 'Databases', skills: ['MongoDB'] }],
    projects: [{ title: 'One', description: 'First project' }, { title: 'Two', description: 'Second project' }, { title: 'Three', description: 'Third project' }],
    professionalLinks: { github: 'https://github.com/example' }, codingProfiles: [{ platform: 'LeetCode', url: 'https://leetcode.com/example' }],
  }
  const saved = await updateStudentProfile('student-1', input, { profileModel, institutionService })
  assert.equal(saved.class10.marksheet.originalName, 'class10.pdf')
  assert.equal(saved.class12.marksheet.originalName, 'class12.pdf')
  assert.equal(saved.skillGroups.length, 3)
  assert.equal(saved.projects.length, 3)
  assert.equal(saved.codingProfiles.length, 1)
  assert.equal(getProfileCompletion(saved).complete, true)
})

test('required college result and optional Class 10/Class 12 marksheets persist with safe Student/Admin download access', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-marksheets-'))
  const class10Path = path.join(directory, 'class-10.pdf')
  const class12Path = path.join(directory, 'class-12.pdf')
  await writeFile(class10Path, '%PDF-1.7\nclass 10')
  await writeFile(class12Path, '%PDF-1.7\nclass 12')
  try {
    const profileModel = createProfileModel()
    await ensureStudentProfile('student-1', { profileModel })
    const afterClass10 = await saveAcademicMarksheet('student-1', 'class10', { originalname: 'class-10.pdf', path: class10Path, mimetype: 'application/pdf', size: 18 }, { profileModel })
    const saved = await saveAcademicMarksheet('student-1', 'class12', { originalname: 'class-12.pdf', path: class12Path, mimetype: 'application/pdf', size: 18 }, { profileModel })
    const savedWithResume = await saveResume('student-1', { originalname: 'resume.pdf', path: class10Path, mimetype: 'application/pdf', size: 18 }, { profileModel })
    const savedWithCollegeResult = await saveAcademicMarksheet('student-1', 'collegeResult', { originalname: 'college-result.pdf', path: class12Path, mimetype: 'application/pdf', size: 18 }, { profileModel })
    assert.equal(afterClass10.class10.marksheet.originalName, 'class-10.pdf')
    assert.equal(saved.class12.marksheet.originalName, 'class-12.pdf')
    assert.equal((await getAcademicMarksheet('student-1', 'class10', { profileModel })).originalName, 'class-10.pdf')
    assert.equal((await getStudentDocumentForAdmin('student-1', 'class12', { userModel: createStudentUserModel(), profileModel })).originalName, 'class-12.pdf')
    assert.equal((await getStudentDocumentForAdmin('student-1', 'resume', { userModel: createStudentUserModel(), profileModel })).originalName, 'resume.pdf')
    assert.equal((await getStudentDocumentForAdmin('student-1', 'collegeResult', { userModel: createStudentUserModel(), profileModel })).originalName, 'college-result.pdf')

    const studentResponse = toProfileResponse(savedWithCollegeResult, { includeResumeDownloadUrl: true })
    const adminResponse = toProfileResponse(savedWithCollegeResult, { adminStudentId: 'student-1' })
    assert.equal(studentResponse.class10.marksheet.storagePath, undefined)
    assert.equal(adminResponse.class12.marksheet.storagePath, undefined)
    assert.equal(studentResponse.class10.marksheet.downloadUrl, '/api/v1/students/me/documents/class10/download')
    assert.equal(adminResponse.class12.marksheet.downloadUrl, '/api/v1/admin/students/student-1/documents/class12/download')
    assert.equal(adminResponse.resume.downloadUrl, '/api/v1/admin/students/student-1/documents/resume/download')
    assert.equal(studentResponse.collegeResult.storagePath, undefined)
    assert.equal(adminResponse.collegeResult.downloadUrl, '/api/v1/admin/students/student-1/documents/collegeResult/download')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('invalid resume content is removed before it can be saved as metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-m3-'))
  const filePath = path.join(directory, 'not-a-pdf.pdf')
  await writeFile(filePath, 'not a PDF')
  try {
    await assert.rejects(saveResume('student-1', { originalname: 'not-a-pdf.pdf', path: filePath, mimetype: 'application/pdf', size: 9 }, { profileModel: createProfileModel() }), { errorCode: 'VALIDATION_ERROR' })
    await assert.rejects(readFile(filePath), { code: 'ENOENT' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('student verification rejects missing student accounts', async () => {
  await assert.rejects(reviewStudentVerification('unknown', 'admin-1', { status: 'verified' }, { userModel: createStudentUserModel(), profileModel: createProfileModel() }), { errorCode: 'NOT_FOUND' })
})
