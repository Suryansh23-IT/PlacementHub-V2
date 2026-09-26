import { API_URL, apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })
const drivePath = id => `/students/me/placement-drives/${encodeURIComponent(id)}`

export const listStudentPlacementDrives = token => apiRequest('/students/me/placement-drives', { headers: headers(token) })
export const getStudentPlacementDrive = (token, id) => apiRequest(drivePath(id), { headers: headers(token) })
export const applyToStudentPlacementDrive = (token, id) => apiRequest(`${drivePath(id)}/apply`, { method: 'POST', headers: headers(token) })
export const listMyPlacementApplications = token => apiRequest('/students/me/applications', { headers: headers(token) })
export const withdrawStudentPlacementApplication = (token, id) => apiRequest(`/students/me/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST', headers: headers(token) })

export async function downloadStudentPlacementDriveDocument(token, id, type) {
  const response = await fetch(`${API_URL}${drivePath(id)}/documents/${encodeURIComponent(type)}/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The Placement Drive PDF could not be downloaded.')
  return response.blob()
}
