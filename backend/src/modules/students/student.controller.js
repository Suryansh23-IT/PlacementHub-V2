import { sendSuccess } from '../../utils/api-response.js'
import { getInstitutionProfile } from '../institution/institution.service.js'
import { getStudentPolicyAgreementSummary } from '../student-policy/student-policy.service.js'
import { getAcademicMarksheet, getProfileCompletion, getResumeForDownload, getStudentDocumentForAdmin, getStudentProfile, listStudentsForReview, resubmitStudentVerification, reviewStudentVerification, saveAcademicMarksheet, saveResume, updateStudentProfile } from './student.service.js'

export function toProfileResponse(profile, { includeResumeDownloadUrl = false, adminStudentId } = {}) {
  const value = profile.toObject ? profile.toObject() : profile
  const safeDocument = (document, url) => document?.marksheet ? { ...document, marksheet: (({ storagePath, ...marksheet }) => ({ ...marksheet, ...(url ? { downloadUrl: url } : {}) }))(document.marksheet) } : document
  const resumeUrl = includeResumeDownloadUrl ? '/api/v1/students/me/resume/download' : adminStudentId ? `/api/v1/admin/students/${adminStudentId}/documents/resume/download` : undefined
  const resume = value.resume ? (({ storagePath, ...file }) => ({ ...file, ...(resumeUrl ? { downloadUrl: resumeUrl } : {}) }))(value.resume) : undefined
  const documentUrl = (type) => includeResumeDownloadUrl ? `/api/v1/students/me/documents/${type}/download` : adminStudentId ? `/api/v1/admin/students/${adminStudentId}/documents/${type}/download` : undefined
  const collegeResult = value.collegeResult ? (({ storagePath, ...file }) => ({ ...file, ...(documentUrl('collegeResult') ? { downloadUrl: documentUrl('collegeResult') } : {}) }))(value.collegeResult) : undefined
  return { ...value, ...(resume ? { resume } : {}), ...(collegeResult ? { collegeResult } : {}), class10: safeDocument(value.class10, documentUrl('class10')), class12: safeDocument(value.class12, documentUrl('class12')), completion: getProfileCompletion(value) }
}

export async function getMyProfile(request, response) {
  const profile = await getStudentProfile(request.user._id)
  return sendSuccess(response, { message: 'Student profile retrieved successfully.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}
export async function getAvailableBranches(request, response) { const institution = await getInstitutionProfile(); return sendSuccess(response, { message: 'Available branches retrieved successfully.', data: institution.branches ?? [] }) }

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
export async function uploadMyMarksheet(request, response) { const profile = await saveAcademicMarksheet(request.user._id, request.params.type, request.file); return sendSuccess(response, { statusCode: 201, message: 'Document uploaded successfully.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) }) }
export async function downloadMyMarksheet(request, response) { const marksheet = await getAcademicMarksheet(request.user._id, request.params.type); return response.download(marksheet.storagePath, marksheet.originalName) }
export async function downloadStudentDocumentForAdmin(request, response) { const document = await getStudentDocumentForAdmin(request.params.id, request.params.type); return response.download(document.storagePath, document.originalName) }

export async function resubmitMyProfileForVerification(request, response) {
  const profile = await resubmitStudentVerification(request.user._id)
  return sendSuccess(response, { message: 'Profile resubmitted for verification.', data: toProfileResponse(profile, { includeResumeDownloadUrl: true }) })
}

export async function getStudentsForReview(request, response) {
  const students = await listStudentsForReview()
  return sendSuccess(response, { message: 'Students retrieved successfully.', data: students.map((student) => ({ ...student, profile: toProfileResponse(student.profile) })) })
}
export async function getStudentForReview(request, response) { const student = (await listStudentsForReview()).find((item) => item._id.toString() === request.params.id); if (!student) return response.status(404).json({ success: false, message: 'Student account was not found.', errorCode: 'NOT_FOUND' }); const placementAgreement = await getStudentPolicyAgreementSummary(student._id); return sendSuccess(response, { message: 'Student retrieved successfully.', data: { ...student, profile: toProfileResponse(student.profile, { adminStudentId: request.params.id }), placementAgreement } }) }

export async function patchStudentVerification(request, response) {
  const profile = await reviewStudentVerification(request.params.id, request.user._id, request.body)
  return sendSuccess(response, { message: `Student ${profile.verificationStatus} successfully.`, data: toProfileResponse(profile) })
}
