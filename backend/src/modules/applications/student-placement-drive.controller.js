import { AppError } from '../../errors/app-error.js'
import { sendSuccess } from '../../utils/api-response.js'
import { applyToStudentPlacementDrive, getStudentPlacementDriveDetail, getStudentPlacementDriveDocument, listMyPlacementApplications, listStudentPlacementDrives } from './student-placement-drive.service.js'
import { withdrawStudentApplication } from './application-withdrawal.service.js'

export async function listStudentDrives(request, response) { return sendSuccess(response, { message: 'Published Placement Drives retrieved.', data: await listStudentPlacementDrives(request.user._id) }) }
export async function getStudentDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive retrieved.', data: await getStudentPlacementDriveDetail(request.user._id, request.params.id) }) }
export async function applyToDrive(request, response) {
  const result = await applyToStudentPlacementDrive(request.user._id, request.params.id)
  if (!result.eligible) throw new AppError('You are not eligible to apply to this Placement Drive.', { statusCode: 422, errorCode: 'INELIGIBLE', details: result.reasons })
  return sendSuccess(response, { statusCode: 201, message: 'Application submitted successfully.', data: result.application })
}
export async function listMyApplications(request, response) { return sendSuccess(response, { message: 'Applications retrieved.', data: await listMyPlacementApplications(request.user._id) }) }
export async function withdrawMyApplication(request, response) { const result = await withdrawStudentApplication(request.user._id, request.params.id); return sendSuccess(response, { message: 'Application withdrawn successfully.', data: result.application }) }
export async function downloadStudentDriveDocument(request, response) { const document = await getStudentPlacementDriveDocument(request.user._id, request.params.id, request.params.type); return response.download(document.storagePath, document.originalName) }
