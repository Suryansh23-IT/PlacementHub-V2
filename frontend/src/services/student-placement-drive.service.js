import { API_URL, apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })
const drivePath = id => `/students/me/placement-drives/${encodeURIComponent(id)}`

export const listStudentPlacementDrives = token => apiRequest('/students/me/placement-drives', { headers: headers(token) })
export const getStudentPlacementDrive = (token, id) => apiRequest(drivePath(id), { headers: headers(token) })
export const applyToStudentPlacementDrive = (token, id) => apiRequest(`${drivePath(id)}/apply`, { method: 'POST', headers: headers(token) })
export const listMyPlacementApplications = token => apiRequest('/students/me/applications', { headers: headers(token) })
export const withdrawStudentPlacementApplication = (token, id) => apiRequest(`/students/me/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST', headers: headers(token) })
export const getStudentRecruitmentJourney = (token, id) => apiRequest(`/students/me/applications/${encodeURIComponent(id)}/journey`, { headers: headers(token) })
export const submitStudentPlacementReport = (token, id, body) => apiRequest(`/students/me/applications/${encodeURIComponent(id)}/placement-report`, { method: 'POST', headers: headers(token), body })
export const uploadStudentPlacementProof = (token, id, file) => { const body = new FormData(); body.append('document', file); return apiRequest(`/students/me/applications/${encodeURIComponent(id)}/placement-proof`, { method: 'POST', headers: headers(token), body }) }
export const listAdminPlacementOutcomes = (token, state) => apiRequest(`/admin/placement-outcomes${state ? `?state=${encodeURIComponent(state)}` : ''}`, { headers: headers(token) })
export const confirmAdminPlacementOutcome = (token, id, body) => apiRequest(`/admin/placement-outcomes/${encodeURIComponent(id)}/confirm`, { method: 'PATCH', headers: headers(token), body })
export const decideAdminPlacementOutcome = (token, id, body) => apiRequest(`/admin/placement-outcomes/${encodeURIComponent(id)}/decision`, { method: 'PATCH', headers: headers(token), body })
export async function downloadAdminPlacementProof(token, id, proofIndex = 0) { const response = await fetch(`${API_URL}/admin/placement-outcomes/${encodeURIComponent(id)}/proofs/${proofIndex}/download`, { headers: headers(token) }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The proof could not be downloaded.'); return response.blob() }

export async function downloadStudentPlacementDriveDocument(token, id, type) {
  const response = await fetch(`${API_URL}${drivePath(id)}/documents/${encodeURIComponent(type)}/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The Placement Drive PDF could not be downloaded.')
  return response.blob()
}

export async function downloadStudentCurrentPhasePdf(token, applicationId) {
  const response = await fetch(`${API_URL}/students/me/applications/${encodeURIComponent(applicationId)}/current-phase/instruction-pdf/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The phase PDF could not be downloaded.')
  return response.blob()
}
