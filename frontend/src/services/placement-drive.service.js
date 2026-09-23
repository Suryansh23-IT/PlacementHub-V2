import { API_URL, apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })
const drivePath = id => `/companies/me/placement-drives/${encodeURIComponent(id)}`
const adminDrivePath = id => `/admin/placement-drives/${encodeURIComponent(id)}`

export const listMyPlacementDrives = token => apiRequest('/companies/me/placement-drives', { headers: headers(token) })
export const getMyPlacementDriveBranches = token => apiRequest('/companies/me/placement-drives/branches', { headers: headers(token) })
export const getMyPlacementDrive = (token, id) => apiRequest(drivePath(id), { headers: headers(token) })
export const createMyPlacementDrive = (token, body) => apiRequest('/companies/me/placement-drives', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const updateMyPlacementDrive = (token, id, body) => apiRequest(drivePath(id), { method: 'PATCH', headers: headers(token), body: JSON.stringify(body) })
export const submitMyPlacementDrive = (token, id) => apiRequest(`${drivePath(id)}/submit`, { method: 'POST', headers: headers(token) })
export const resubmitMyPlacementDrive = (token, id) => apiRequest(`${drivePath(id)}/resubmit`, { method: 'POST', headers: headers(token) })

export function uploadMyPlacementDriveDocument(token, id, type, file) {
  const body = new FormData()
  body.append('document', file)
  return apiRequest(`${drivePath(id)}/documents/${encodeURIComponent(type)}`, { method: 'POST', headers: headers(token), body })
}

export async function downloadMyPlacementDriveDocument(token, id, type) {
  const response = await fetch(`${API_URL}${drivePath(id)}/documents/${encodeURIComponent(type)}/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The proposal PDF could not be downloaded.')
  return response.blob()
}

export const listAdminPlacementDrives = token => apiRequest('/admin/placement-drives', { headers: headers(token) })
export const getAdminPlacementDrive = (token, id) => apiRequest(adminDrivePath(id), { headers: headers(token) })
export const reviewAdminPlacementDrive = (token, id, body) => apiRequest(`${adminDrivePath(id)}/review`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(body) })

export async function downloadAdminPlacementDriveDocument(token, id, type) {
  const response = await fetch(`${API_URL}${adminDrivePath(id)}/documents/${encodeURIComponent(type)}/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The proposal PDF could not be downloaded.')
  return response.blob()
}
