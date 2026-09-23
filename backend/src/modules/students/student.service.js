import { readFile, unlink } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { StudentProfile } from './student.model.js'
import { getInstitutionProfile } from '../institution/institution.service.js'

const VERIFICATION_STATUS = Object.freeze({ PENDING: 'pending', VERIFIED: 'verified', REJECTED: 'rejected' })

export async function ensureStudentProfile(userId, { profileModel = StudentProfile } = {}) {
  return profileModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
}

export async function getStudentProfile(userId, dependencies = {}) {
  return ensureStudentProfile(userId, dependencies)
}

export async function updateStudentProfile(userId, input, { profileModel = StudentProfile, institutionService = getInstitutionProfile } = {}) {
  const current = await ensureStudentProfile(userId, { profileModel })
  const institution = await institutionService()
  const branches = institution.branches ?? []
  if (!branches.includes(input.branch)) throw new AppError('Select a branch configured by the Placement Admin.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const material = hasVerificationCriticalChanges(current, input)
  // PATCH validation intentionally excludes document metadata. Merge the existing
  // optional marksheets so an ordinary profile save cannot replace their subdocuments.
  const update = {
    ...input,
    class10: mergeAcademicRecord(current.class10, input.class10),
    class12: mergeAcademicRecord(current.class12, input.class12),
  }
  if (current.verificationStatus === VERIFICATION_STATUS.VERIFIED && material) Object.assign(update, { verificationStatus: VERIFICATION_STATUS.PENDING, reviewedBy: undefined, reviewedAt: undefined, rejectionReason: undefined })
  return profileModel.findOneAndUpdate({ userId }, { $set: update }, { new: true, runValidators: true })
}

export async function saveAcademicMarksheet(userId, type, file, { profileModel = StudentProfile } = {}) {
  if (!file) throw new AppError('Attach a PDF document to upload.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const contents = await readFile(file.path).catch(() => null)
  if (!contents?.subarray(0, 5).equals(Buffer.from('%PDF-'))) { await unlink(file.path).catch(() => undefined); throw new AppError('The uploaded file is not a valid PDF document.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }) }
  const profile = await ensureStudentProfile(userId, { profileModel })
  const document = { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() }
  const previous = type === 'collegeResult' ? profile.collegeResult?.storagePath : profile[type]?.marksheet?.storagePath
  if (type === 'collegeResult') {
    profile.collegeResult = document
    revokeVerificationForMaterialChange(profile)
  } else {
    profile[type] ??= {}
    profile[type].marksheet = document
  }
  try { await profile.save() } catch (error) { await unlink(file.path).catch(() => undefined); throw error }
  if (previous && previous !== file.path) await unlink(previous).catch(() => undefined)
  return profile
}
export async function getAcademicMarksheet(userId, type, dependencies = {}) { const profile = await getStudentProfile(userId, dependencies); const document = type === 'collegeResult' ? profile.collegeResult : profile[type]?.marksheet; if (!document) throw new AppError('No document has been uploaded yet.', { statusCode: 404, errorCode: 'NOT_FOUND' }); return document }

export async function getStudentDocumentForAdmin(studentId, type, { userModel = User, profileModel = StudentProfile } = {}) {
  const student = await userModel.findOne({ _id: studentId, role: USER_ROLES.STUDENT }).select('_id')
  if (!student) throw new AppError('Student account was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  if (type === 'resume') return getResumeForDownload(student._id, { profileModel })
  return getAcademicMarksheet(student._id, type, { profileModel })
}

export async function saveResume(userId, file, { profileModel = StudentProfile } = {}) {
  if (!file) {
    throw new AppError('Attach a PDF resume to upload.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }

  const contents = await readFile(file.path).catch(() => null)
  if (!contents?.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    await unlink(file.path).catch(() => undefined)
    throw new AppError('The uploaded file is not a valid PDF resume.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }

  const profile = await ensureStudentProfile(userId, { profileModel })
  const previousPath = profile.resume?.storagePath
  profile.resume = {
    originalName: file.originalname,
    storagePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
  }
  revokeVerificationForMaterialChange(profile)
  try {
    await profile.save()
  } catch (error) {
    await unlink(file.path).catch(() => undefined)
    throw error
  }

  if (previousPath && previousPath !== file.path) {
    await unlink(previousPath).catch(() => undefined)
  }
  return profile
}

export async function getResumeForDownload(userId, dependencies = {}) {
  const profile = await getStudentProfile(userId, dependencies)
  if (!profile.resume) {
    throw new AppError('No resume has been uploaded yet.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  }
  return profile.resume
}

export async function listStudentsForReview({ userModel = User, profileModel = StudentProfile } = {}) {
  const students = await userModel.find({ role: USER_ROLES.STUDENT }).select('_id name email createdAt').lean()
  const profiles = await profileModel.find({ userId: { $in: students.map((student) => student._id) } }).lean()
  const profileByUserId = new Map(profiles.map((profile) => [profile.userId.toString(), profile]))

  return Promise.all(students.map(async (student) => {
    const profile = profileByUserId.get(student._id.toString()) ?? await ensureStudentProfile(student._id, { profileModel })
    return { ...student, profile }
  }))
}

export async function reviewStudentVerification(studentId, reviewerId, input, { userModel = User, profileModel = StudentProfile } = {}) {
  const student = await userModel.findOne({ _id: studentId, role: USER_ROLES.STUDENT }).select('_id')
  if (!student) {
    throw new AppError('Student account was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  }

  const profile = await ensureStudentProfile(student._id, { profileModel })
  if (profile.verificationStatus !== VERIFICATION_STATUS.PENDING) {
    throw new AppError('Only pending student profiles can be reviewed.', { statusCode: 409, errorCode: 'CONFLICT' })
  }

  if (input.status === VERIFICATION_STATUS.VERIFIED) assertProfileReadyForVerification(profile, 'verification')

  profile.verificationStatus = input.status
  profile.reviewedBy = reviewerId
  profile.reviewedAt = new Date()
  profile.rejectionReason = input.status === VERIFICATION_STATUS.REJECTED ? input.rejectionReason : undefined
  await profile.save()
  return profile
}

export async function resubmitStudentVerification(userId, { profileModel = StudentProfile } = {}) {
  const profile = await getStudentProfile(userId, { profileModel })
  if (profile.verificationStatus !== VERIFICATION_STATUS.REJECTED) {
    throw new AppError('Only rejected student profiles can be resubmitted for verification.', { statusCode: 409, errorCode: 'CONFLICT' })
  }
  assertProfileReadyForVerification(profile, 'resubmission')

  profile.verificationStatus = VERIFICATION_STATUS.PENDING
  profile.reviewedBy = undefined
  profile.reviewedAt = undefined
  profile.rejectionReason = undefined
  await profile.save()
  return profile
}

export function getProfileCompletion(profile) {
  const hasAcademicRecord = (record) => Boolean(record?.board && record?.schoolName && record?.passingYear !== undefined && record?.score !== undefined)
  const hasSkillGroup = (group) => Boolean(group?.name && (group.skills ?? []).length)
  const hasProject = (project) => Boolean(project?.title && project?.description)
  const checks = {
    basicDetails: Boolean(profile.phone && profile.rollNumber && profile.branch && profile.graduationYear),
    class10: hasAcademicRecord(profile.class10),
    class12: hasAcademicRecord(profile.class12),
    collegeAcademic: Boolean(profile.cgpa !== undefined && profile.activeBacklogs !== undefined && (profile.semesterSpis ?? []).length),
    skillGroups: Boolean((profile.skillGroups ?? []).length) && (profile.skillGroups ?? []).every(hasSkillGroup),
    projects: Boolean((profile.projects ?? []).length) && (profile.projects ?? []).every(hasProject),
    resume: Boolean(profile.resume),
    collegeResult: Boolean(profile.collegeResult),
  }
  const values = Object.values(checks)
  return { checks, complete: values.every(Boolean), percentage: Math.round((values.filter(Boolean).length / values.length) * 100) }
}

function assertProfileReadyForVerification(profile, action) {
  if (getProfileCompletion(profile).complete) return
  const message = action === 'resubmission'
    ? 'Complete the required profile details and upload a resume and college result before resubmitting.'
    : 'The student must complete the required profile details and upload a resume and college result before verification.'
  throw new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })
}

const VERIFICATION_CRITICAL_PROFILE_FIELDS = Object.freeze([
  'branch',
  'graduationYear',
  'cgpa',
  'activeBacklogs',
  'class10',
  'class12',
  'semesterSpis',
  'skillGroups',
  'projects',
])

function hasVerificationCriticalChanges(current, input) {
  return VERIFICATION_CRITICAL_PROFILE_FIELDS.some((field) => !isDeepStrictEqual(toComparable(current[field], field), toComparable(input[field], field)))
}

function mergeAcademicRecord(current, input) {
  const marksheet = current?.marksheet?.toObject ? current.marksheet.toObject() : current?.marksheet
  return { ...input, ...(marksheet ? { marksheet } : {}) }
}

function toComparable(value, field) {
  const plainValue = value?.toObject ? value.toObject() : value
  if (field === 'class10' || field === 'class12') {
    const { board, schoolName, passingYear, score } = plainValue ?? {}
    return { board: board ?? null, schoolName: schoolName ?? null, passingYear: passingYear ?? null, score: score ?? null }
  }
  return JSON.parse(JSON.stringify(plainValue ?? null))
}

function revokeVerificationForMaterialChange(profile) {
  if (profile.verificationStatus !== VERIFICATION_STATUS.VERIFIED) return
  profile.verificationStatus = VERIFICATION_STATUS.PENDING
  profile.reviewedBy = undefined
  profile.reviewedAt = undefined
  profile.rejectionReason = undefined
}

export { VERIFICATION_STATUS }
