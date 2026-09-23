import { sendSuccess } from '../../utils/api-response.js'
import { AppError } from '../../errors/app-error.js'
import { User } from '../auth/auth.model.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { acceptRecruiterPolicy, getRecruiterAgreementSummary, getRecruiterPolicyStatus, listRecruiterPolicies, requireApprovedCompany, saveRecruiterPolicy } from './recruiter-policy.service.js'

const publicPolicy = policy => policy && ({ _id: policy._id, title: policy.title, academicYear: policy.academicYear, version: policy.version, policyText: policy.policyText, active: policy.active })
const publicStatus = ({ policy, acceptance }) => ({ policy: publicPolicy(policy), acceptance: acceptance && ({ companyId: acceptance.companyId, policyId: acceptance.policyId, policyVersion: acceptance.policyVersion, acceptedAt: acceptance.acceptedAt }) })
export async function getAdminRecruiterPolicies(request, response) {
  return sendSuccess(response, { message: 'Recruiter policies retrieved.', data: (await listRecruiterPolicies()).map(publicPolicy) })
}
export async function putAdminRecruiterPolicy(request, response) {
  return sendSuccess(response, { message: 'Recruiter policy saved.', data: publicPolicy(await saveRecruiterPolicy(request.body)) })
}
export async function getMyRecruiterPolicy(request, response) {
  await requireApprovedCompany(request.user._id)
  return sendSuccess(response, { message: 'Recruiter policy retrieved.', data: publicStatus(await getRecruiterPolicyStatus(request.user._id)) })
}
export async function acceptMyRecruiterPolicy(request, response) {
  return sendSuccess(response, { statusCode: 201, message: 'Recruiter Placement Agreement accepted.', data: publicStatus(await acceptRecruiterPolicy(request.user._id, request.body)) })
}
export async function getAdminRecruiterAgreement(request, response) {
  const user = await User.findOne({ _id: request.params.id, role: USER_ROLES.COMPANY }).select('_id')
  if (!user) throw new AppError('Company account was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return sendSuccess(response, { message: 'Recruiter agreement status retrieved.', data: await getRecruiterAgreementSummary(user._id) })
}
