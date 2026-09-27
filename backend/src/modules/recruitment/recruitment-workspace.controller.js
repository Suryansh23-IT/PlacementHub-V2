import { sendSuccess } from '../../utils/api-response.js'
import { bulkTransitionCompanyRecruitmentCandidates, getCompanyPhaseCandidateRecipientCount, getCompanyPhaseInstructionPdf, getCompanyRecruitmentWorkspace, listCompanyRecruitmentActivity, listCompanyRecruitmentCandidates, saveCompanyPhaseInstructionPdf, transitionCompanyRecruitmentCandidate, updateCompanyPhaseExecution } from './recruitment-workspace.service.js'
import { exportCompanyRecruitmentCandidates } from './recruitment-export.service.js'
import { invalidateUnselectedPlacementReport, notifyProvisionalSelection } from '../placements/placement-record.service.js'
import { PlacementRecord } from '../placements/placement-record.model.js'

export async function getMyRecruitmentWorkspace(request, response) { return sendSuccess(response, { message: 'Recruitment workspace retrieved.', data: await getCompanyRecruitmentWorkspace(request.user._id, request.params.id, { placementRecordModel: PlacementRecord }) }) }
export async function listMyRecruitmentCandidates(request, response) { return sendSuccess(response, { message: 'Recruitment candidates retrieved.', data: await listCompanyRecruitmentCandidates(request.user._id, request.params.id, request.validatedQuery ?? request.query, { placementRecordModel: PlacementRecord }) }) }
export async function listMyRecruitmentActivity(request, response) { return sendSuccess(response, { message: 'Recruitment activity retrieved.', data: await listCompanyRecruitmentActivity(request.user._id, request.params.id, { placementRecordModel: PlacementRecord }) }) }
export async function transitionMyRecruitmentCandidate(request, response) { const data = await transitionCompanyRecruitmentCandidate(request.user._id, request.params.id, request.params.applicationId, request.body); if (['provisionally_select', 'unselect'].includes(request.body.action)) { if (request.body.action === 'unselect') await invalidateUnselectedPlacementReport(data._id, request.user._id); await notifyProvisionalSelection(data, request.body.action, request.user._id) } return sendSuccess(response, { message: 'Candidate transition saved.', data }) }
export async function bulkTransitionMyRecruitmentCandidates(request, response) { return sendSuccess(response, { message: 'Bulk candidate transition completed.', data: await bulkTransitionCompanyRecruitmentCandidates(request.user._id, request.params.id, request.body.applicationIds, request.body.transition) }) }
export async function updateMyPhaseExecution(request, response) { return sendSuccess(response, { message: 'Phase execution saved.', data: await updateCompanyPhaseExecution(request.user._id, request.params.id, request.params.phaseNumber, request.body) }) }
export async function uploadMyPhaseInstructionPdf(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Phase instruction PDF uploaded.', data: await saveCompanyPhaseInstructionPdf(request.user._id, request.params.id, request.params.phaseNumber, request.file) }) }
export async function downloadMyPhaseInstructionPdf(request, response) { const file = await getCompanyPhaseInstructionPdf(request.user._id, request.params.id, request.params.phaseNumber); return response.download(file.storagePath, file.originalName) }
export async function getMyPhaseCandidateRecipientCount(request, response) { return sendSuccess(response, { message: 'Current phase recipient count retrieved.', data: await getCompanyPhaseCandidateRecipientCount(request.user._id, request.params.id, request.params.phaseNumber) }) }
export async function exportMyRecruitmentCandidates(request, response) {
  const exported = await exportCompanyRecruitmentCandidates(request.user._id, request.params.id, request.validatedQuery ?? request.query, { placementRecordModel: PlacementRecord })
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`)
  return response.send(exported.buffer)
}
