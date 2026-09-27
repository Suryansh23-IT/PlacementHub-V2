import { API_URL, apiRequest } from './api-client.js'
const headers = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
const base = id => `/companies/me/placement-drives/${encodeURIComponent(id)}/recruitment`
export const getCompanyRecruitmentWorkspace = (token, id) => apiRequest(base(id), { headers: headers(token) })
export const listCompanyRecruitmentCandidates = (token, id, query = {}) => apiRequest(`${base(id)}/candidates?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined))}`, { headers: headers(token) })
export const listCompanyRecruitmentActivity = (token, id) => apiRequest(`${base(id)}/activity`, { headers: headers(token) })
export const transitionCompanyRecruitmentCandidate = (token, id, applicationId, transition) => apiRequest(`${base(id)}/candidates/${applicationId}/transition`, { method: 'POST', headers: headers(token), body: JSON.stringify(transition) })
export const bulkTransitionCompanyRecruitmentCandidates = (token, id, applicationIds, transition) => apiRequest(`${base(id)}/candidates/bulk-transition`, { method: 'POST', headers: headers(token), body: JSON.stringify({ applicationIds, transition }) })
export const updateCompanyPhaseExecution = (token, id, phaseNumber, body) => apiRequest(`${base(id)}/phases/${phaseNumber}`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(body) })
export const uploadCompanyPhaseInstructionPdf = (token, id, phaseNumber, file) => { const body = new FormData(); body.append('document', file); return apiRequest(`${base(id)}/phases/${phaseNumber}/instruction-pdf`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }) }
export const getCompanyPhaseCandidateRecipientCount = (token, id, phaseNumber) => apiRequest(`${base(id)}/phases/${phaseNumber}/recipient-count`, { headers: headers(token) })
export const sendCompanyPhaseCandidatesNotification = (token, body) => apiRequest('/companies/me/notifications/phase-candidates', { method: 'POST', headers: headers(token), body })
export async function downloadCompanyRecruitmentCandidates(token, id, query) {
  const response = await fetch(`${API_URL}${base(id)}/candidates/export?${new URLSearchParams(query)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.message ?? 'Candidate export could not be generated.') }
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'candidates.xlsx'; anchor.click(); URL.revokeObjectURL(url)
}
