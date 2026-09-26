import { sendSuccess } from '../../utils/api-response.js'
import { getCompanyDriveApplicant, getCompanyDriveApplicantResume, listCompanyDriveApplicants } from './company-drive-applicant.service.js'

export async function listDriveApplicants(request, response) {
  return sendSuccess(response, { message: 'Phase 0 applicants retrieved.', data: await listCompanyDriveApplicants(request.user._id, request.params.id) })
}

export async function getDriveApplicant(request, response) {
  return sendSuccess(response, { message: 'Applicant profile retrieved.', data: await getCompanyDriveApplicant(request.user._id, request.params.id, request.params.studentId) })
}

export async function downloadDriveApplicantResume(request, response) {
  const resume = await getCompanyDriveApplicantResume(request.user._id, request.params.id, request.params.studentId)
  return response.download(resume.storagePath, resume.originalName)
}
