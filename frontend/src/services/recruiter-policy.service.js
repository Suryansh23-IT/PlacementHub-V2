import { apiRequest } from './api-client.js'
const headers = token => ({ Authorization: `Bearer ${token}` })
export const getAdminRecruiterPolicies = token => apiRequest('/admin/recruiter-policy', { headers: headers(token) })
export const saveAdminRecruiterPolicy = (token, body) => apiRequest('/admin/recruiter-policy', { method: 'PUT', headers: headers(token), body: JSON.stringify(body) })
export const getMyRecruiterPolicy = token => apiRequest('/companies/me/policy', { headers: headers(token) })
export const acceptMyRecruiterPolicy = (token, policy) => apiRequest('/companies/me/policy/accept', { method: 'POST', headers: headers(token), body: JSON.stringify({ policyId: policy._id, policyVersion: policy.version, agreed: true }) })
export const getRecruiterAgreement = (token, id) => apiRequest(`/admin/recruiter-policy/companies/${encodeURIComponent(id)}`, { headers: headers(token) })
