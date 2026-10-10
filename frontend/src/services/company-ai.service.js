import { apiRequest } from './api-client.js'
const root = driveId => `/ai/companies/drives/${encodeURIComponent(driveId)}`
const auth = (token, signal) => ({ headers: { Authorization: `Bearer ${token}` }, signal })
export const getCompanyAiOverview = (token, candidates, signal) => apiRequest('/ai/companies/overview', { ...auth(token, signal), method: 'POST', body: { candidates } })
export const getCompanyCandidateAi = (token, driveId, studentId, signal) => apiRequest(`${root(driveId)}/candidates/${encodeURIComponent(studentId)}`, auth(token, signal))
export const assessCompanyCandidateAi = (token, driveId, studentId, signal) => apiRequest(`${root(driveId)}/candidates/${encodeURIComponent(studentId)}/assessment`, { ...auth(token, signal), method: 'POST', body: {} })
export const askCompanyCandidateAi = (token, driveId, studentId, question, signal) => apiRequest(`${root(driveId)}/candidates/${encodeURIComponent(studentId)}/ask`, { ...auth(token, signal), method: 'POST', body: { question } })
export const askCompanyGroupAi = (token, driveId, question, signal) => apiRequest(`${root(driveId)}/group/ask`, { ...auth(token, signal), method: 'POST', body: { question } })
export const startCompanyAiBatch = (token, driveId, studentIds, signal) => apiRequest(`${root(driveId)}/batches`, { ...auth(token, signal), method: 'POST', body: { studentIds } })
export const pollCompanyAiBatch = (token, driveId, jobId, signal) => apiRequest(`${root(driveId)}/batches/${encodeURIComponent(jobId)}`, auth(token, signal))
