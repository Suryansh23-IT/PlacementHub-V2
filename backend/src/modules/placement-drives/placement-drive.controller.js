import { sendSuccess } from '../../utils/api-response.js'
import { createPlacementDriveDraft, getMyPlacementDrive, getMyPlacementDriveDocument, getPlacementDriveDocumentForAdmin, getPlacementDriveBranches, getPlacementDriveProposal, listMyPlacementDrives, listPlacementDriveProposals, resubmitMyPlacementDrive, reviewPlacementDriveProposal, saveMyPlacementDriveDocument, submitMyPlacementDrive, updateMyPlacementDrive } from './placement-drive.service.js'

function publicDocument(document) {
  if (!document) return undefined
  const { storagePath, ...safe } = document.toObject ? document.toObject() : document
  return safe
}

export function toPlacementDriveResponse(drive) {
  const value = drive.toObject ? drive.toObject() : drive
  return { ...value, documents: { companyRecruitmentInformation: publicDocument(value.documents?.companyRecruitmentInformation), placementDriveJobDescription: publicDocument(value.documents?.placementDriveJobDescription) } }
}

export async function createMyPlacementDrive(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Placement Drive draft created.', data: toPlacementDriveResponse(await createPlacementDriveDraft(request.user._id, request.body)) }) }
export async function listMyPlacementDriveBranches(request, response) { return sendSuccess(response, { message: 'Available branches retrieved successfully.', data: await getPlacementDriveBranches() }) }
export async function listMyDrives(request, response) { return sendSuccess(response, { message: 'Placement Drive drafts retrieved.', data: (await listMyPlacementDrives(request.user._id)).map(toPlacementDriveResponse) }) }
export async function getMyDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive retrieved.', data: toPlacementDriveResponse(await getMyPlacementDrive(request.user._id, request.params.id)) }) }
export async function updateMyDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive draft saved.', data: toPlacementDriveResponse(await updateMyPlacementDrive(request.user._id, request.params.id, request.body)) }) }
export async function uploadMyDriveDocument(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Placement Drive PDF uploaded.', data: toPlacementDriveResponse(await saveMyPlacementDriveDocument(request.user._id, request.params.id, request.params.type, request.file)) }) }
export async function downloadMyDriveDocument(request, response) { const file = await getMyPlacementDriveDocument(request.user._id, request.params.id, request.params.type); return response.download(file.storagePath, file.originalName) }
export async function submitMyDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive proposal submitted for Admin review.', data: toPlacementDriveResponse(await submitMyPlacementDrive(request.user._id, request.params.id)) }) }
export async function resubmitMyDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive proposal resubmitted for Admin review.', data: toPlacementDriveResponse(await resubmitMyPlacementDrive(request.user._id, request.params.id)) }) }
export async function listAdminDrives(request, response) { return sendSuccess(response, { message: 'Placement Drive proposals retrieved.', data: (await listPlacementDriveProposals()).map(toPlacementDriveResponse) }) }
export async function getAdminDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive proposal retrieved.', data: toPlacementDriveResponse(await getPlacementDriveProposal(request.params.id)) }) }
export async function reviewAdminDrive(request, response) { return sendSuccess(response, { message: 'Placement Drive proposal reviewed.', data: toPlacementDriveResponse(await reviewPlacementDriveProposal(request.params.id, request.user._id, request.body)) }) }
export async function downloadAdminDriveDocument(request, response) { const file = await getPlacementDriveDocumentForAdmin(request.params.id, request.params.type); return response.download(file.storagePath, file.originalName) }
