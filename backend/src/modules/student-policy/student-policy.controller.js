import { sendSuccess } from '../../utils/api-response.js'
import { acceptActiveStudentPolicy, getActivePolicy, getStudentPolicyStatus, saveStudentPolicy } from './student-policy.service.js'

const publicPolicy = (policy) => ({ _id: policy._id, title: policy.title, academicYear: policy.academicYear, version: policy.version, policyText: policy.policyText, active: policy.active })
const publicAcceptance = (acceptance) => acceptance && ({ policyId: acceptance.policyId, policyVersion: acceptance.policyVersion, acceptedAt: acceptance.acceptedAt })
export async function getAdminStudentPolicy(request, response) { return sendSuccess(response, { message: 'Student Placement Policy retrieved successfully.', data: publicPolicy(await getActivePolicy()) }) }
export async function putAdminStudentPolicy(request, response) { return sendSuccess(response, { message: 'Student Placement Policy saved successfully.', data: publicPolicy(await saveStudentPolicy(request.body)) }) }
export async function getMyStudentPolicy(request, response) { const { policy, acceptance } = await getStudentPolicyStatus(request.user._id); return sendSuccess(response, { message: 'Student Placement Policy retrieved successfully.', data: { policy: publicPolicy(policy), acceptance: publicAcceptance(acceptance) } }) }
export async function acceptMyStudentPolicy(request, response) { const { policy, acceptance } = await acceptActiveStudentPolicy(request.user._id); return sendSuccess(response, { statusCode: 201, message: 'Student Placement Policy accepted successfully.', data: { policy: publicPolicy(policy), acceptance: publicAcceptance(acceptance) } }) }
