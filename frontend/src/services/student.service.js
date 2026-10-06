import { API_URL, apiRequest } from './api-client.js'

function bearer(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getMyStudentProfile(accessToken) {
  return apiRequest('/students/me', { headers: bearer(accessToken) })
}
export function getMyStudentIdentityContext(accessToken) { return apiRequest('/students/me/identity-context', { headers: bearer(accessToken) }) }
export function getAvailableBranches(accessToken) { return apiRequest('/students/me/branches', { headers: bearer(accessToken) }) }

export function updateMyStudentProfile(accessToken, input) {
  return apiRequest('/students/me', { method: 'PATCH', headers: bearer(accessToken), body: JSON.stringify(input) })
}

export function uploadMyResume(accessToken, file) {
  const body = new FormData()
  body.append('resume', file)
  return apiRequest('/students/me/resume', { method: 'POST', headers: bearer(accessToken), body })
}
export function uploadMyMarksheet(accessToken, type, file) { const body = new FormData(); body.append('marksheet', file); return apiRequest(`/students/me/documents/${type}`, { method: 'POST', headers: bearer(accessToken), body }) }

export function resubmitMyProfileForVerification(accessToken) {
  return apiRequest('/students/me/verification/resubmit', { method: 'POST', headers: bearer(accessToken) })
}

export async function downloadMyResume(accessToken) {
  const response = await fetch(`${API_URL}/students/me/resume/download`, { headers: bearer(accessToken) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message ?? 'The resume could not be downloaded.')
  }
  return response.blob()
}
export async function downloadMyDocument(accessToken, type) { const path = type === 'resume' ? '/students/me/resume/download' : `/students/me/documents/${type}/download`; const response = await fetch(`${API_URL}${path}`, { headers: bearer(accessToken) }); if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.message ?? 'The document could not be downloaded.') } return response.blob() }
export async function downloadAdminStudentDocument(accessToken, studentId, type) { const response = await fetch(`${API_URL}/admin/students/${studentId}/documents/${type}/download`, { headers: bearer(accessToken) }); if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.message ?? 'The document could not be downloaded.') } return response.blob() }

export function getStudentsForReview(accessToken) {
  return apiRequest('/admin/students', { headers: bearer(accessToken) })
}
export function exploreStudents(accessToken, filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '').map(([key, value]) => [key, value])); return apiRequest(`/admin/students/explorer?${query}`, { headers: bearer(accessToken) }) }
export async function exportStudentExplorer(accessToken, body) {
  const response = await fetch(`${API_URL}/admin/students/explorer/export`, { method: 'POST', headers: { ...bearer(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.message ?? 'The student export could not be generated.') }
  return { blob: await response.blob(), filename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)/i)?.[1] ?? 'placementhub-students.xlsx' }
}
export function previewStudentExplorerRecipients(accessToken, body) { return apiRequest('/admin/students/explorer/notification-preview', { method: 'POST', headers: bearer(accessToken), body }) }
export function sendStudentExplorerNotification(accessToken, body) { return apiRequest('/admin/students/explorer/notifications', { method: 'POST', headers: bearer(accessToken), body }) }
export function getStudentForReview(accessToken, studentId) { return apiRequest(`/admin/students/${studentId}`, { headers: bearer(accessToken) }) }

export function reviewStudent(accessToken, studentId, input) {
  return apiRequest(`/admin/students/${studentId}/verification`, { method: 'PATCH', headers: bearer(accessToken), body: JSON.stringify(input) })
}
