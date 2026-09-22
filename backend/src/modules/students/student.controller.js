import { sendSuccess } from '../../utils/api-response.js'
import { getResumeForDownload, getStudentProfile, listStudentsForReview, resubmitStudentVerification, reviewStudentVerification, saveResume, updateStudentProfile } from './student.service.js'

function toProfileResponse(profile, { includeResumeDownloadUrl = false } = {}) {
  const value = profile.toObject ? profile.toObject() : profile
  if (!value.resume) return value
  const { storagePath, ...resume } = value.resume
  return {
    ...value,
    resume: {
      ...resume,
      ...(includeResumeDownloadUrl ? { downloadUrl: '/api/v1/students/me/resume/download' } : {}),
    },
  }
}

export async function getMyProfile(request, response) {
  const profile = await getStudentProfile(request.user._id)
  return sendSuccess(response, { message: 'Student profile retrieved successfully.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}

export async function patchMyProfile(request, response) {
  const profile = await updateStudentProfile(request.user._id, request.body)
  return sendSuccess(response, { message: 'Student profile updated successfully.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}

export async function uploadMyResume(request, response) {
  const profile = await saveResume(request.user._id, request.file)
  return sendSuccess(response, { statusCode: 201, message: 'Resume uploaded successfully.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}

export async function downloadMyResume(request, response) {
  const resume = await getResumeForDownload(request.user._id)
  return response.download(resume.storagePath, resume.originalName)
}

export async function resubmitMyProfileForVerification(request, response) {
  const profile = await resubmitStudentVerification(request.user._id)
  return sendSuccess(response, { message: 'Profile resubmitted for verification.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}

export async function getStudentsForReview(request, response) {
  const students = await listStudentsForReview()
  return sendSuccess(response, { message: 'Students retrieved successfully.', data: students.map((student) => ({ ...student, profile: toProfileResponse(student.profile) })) })
}

export async function patchStudentVerification(request, response) {
  const profile = await reviewStudentVerification(request.params.id, request.user._id, request.body)
  return sendSuccess(response, { message: `Student ${profile.verificationStatus} successfully.`, data: toProfileResponse(profile) })
}
