import { readFile, unlink } from 'node:fs/promises'
import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { StudentProfile } from './student.model.js'

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

export async function updateStudentProfile(userId, input, { profileModel = StudentProfile } = {}) {
  await ensureStudentProfile(userId, { profileModel })
  return profileModel.findOneAndUpdate({ userId }, { $set: input }, { new: true, runValidators: true })
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

  if (input.status === VERIFICATION_STATUS.VERIFIED && !isProfileReadyForVerification(profile)) {
    throw new AppError('Student academic details and a resume are required before verification.', { statusCode: 409, errorCode: 'CONFLICT' })
  }

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
  if (!isProfileReadyForVerification(profile)) {
    throw new AppError('Complete your academic details and upload a resume before resubmitting.', { statusCode: 409, errorCode: 'CONFLICT' })
  }

  profile.verificationStatus = VERIFICATION_STATUS.PENDING
  profile.reviewedBy = undefined
  profile.reviewedAt = undefined
  profile.rejectionReason = undefined
  await profile.save()
  return profile
}

function isProfileReadyForVerification(profile) {
  return Boolean(profile.branch && profile.graduationYear && profile.cgpa !== undefined && profile.cgpa !== null && profile.activeBacklogs !== undefined && profile.activeBacklogs !== null && profile.resume)
}

export { VERIFICATION_STATUS }
