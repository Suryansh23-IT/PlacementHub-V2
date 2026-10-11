import { publicPdfMetadata, sendPdfDownload } from '../../storage/pdf-storage.js'
import { sendSuccess } from '../../utils/api-response.js'
import { ensureCompanyProfile, hasCompleteProfile, getParticipationLetter, getAdminParticipationLetter, listCompaniesForReview, resubmitCompany, reviewCompany, updateCompanyProfile, uploadParticipationLetter } from './company.service.js'
export async function downloadAdminParticipationLetter(request, response) {
  const file = await getAdminParticipationLetter(request.params.id)
  return sendPdfDownload(response, file, 'participation-letter')
}
export function toCompanyResponse(company) {
  const value = company.toObject ? company.toObject() : company
  return { ...value, participationLetter: value.participationLetter ? publicPdfMetadata(value.participationLetter) : undefined }
}
const withCompletion = company => ({ ...toCompanyResponse(company), isProfileComplete: hasCompleteProfile(company) })
export async function getMyCompany(request, response) { const data = await ensureCompanyProfile(request.user._id); return sendSuccess(response, { message: 'Company profile retrieved successfully.', data: withCompletion(data) }) }
export async function patchMyCompany(request, response) { const data = await updateCompanyProfile(request.user._id, request.body); return sendSuccess(response, { message: 'Company profile updated successfully.', data: withCompletion(data) }) }
export async function getCompanies(request, response) { const data = await listCompaniesForReview(); return sendSuccess(response, { message: 'Companies retrieved successfully.', data: data.map(row => ({ ...row, company: toCompanyResponse(row.company) })) }) }
export async function patchCompanyApproval(request, response) { const data = await reviewCompany(request.params.id, request.user._id, request.body); return sendSuccess(response, { message: `Company ${data.approvalStatus} successfully.`, data: toCompanyResponse(data) }) }
export async function uploadMyParticipationLetter(request,response){const data=await uploadParticipationLetter(request.user._id,request.file);return sendSuccess(response,{statusCode:201,message:'Participation Letter uploaded.',data:withCompletion(data)})}
export async function downloadMyParticipationLetter(request,response){const file=await getParticipationLetter(request.user._id);return sendPdfDownload(response, file, 'participation-letter')}
export async function resubmitMyCompany(request,response){const data=await resubmitCompany(request.user._id);return sendSuccess(response,{message:'Company profile resubmitted.',data:withCompletion(data)})}
