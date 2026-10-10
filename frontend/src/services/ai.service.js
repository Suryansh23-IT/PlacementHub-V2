import { apiRequest } from './api-client.js'

export function getStudentIntelligence(token, { driveId, explain = false, signal } = {}) {
  const base = driveId ? `/ai/students/me/drives/${encodeURIComponent(driveId)}/match` : '/ai/students/me/career'
  return apiRequest(`${base}${explain ? '/explanation' : ''}`, { method: explain ? 'POST' : 'GET', signal, headers: { Authorization: `Bearer ${token}` }, ...(explain ? { body: {} } : {}) })
}

export function askStudentIntelligence(token, { driveId, question, signal }) {
  const base = driveId ? `/ai/students/me/drives/${encodeURIComponent(driveId)}/match` : '/ai/students/me/career'
  return apiRequest(`${base}/ask`, { method: 'POST', signal, headers: { Authorization: `Bearer ${token}` }, body: { question } })
}

export function assessStudentIntelligence(token, { driveId, signal } = {}) {
  const base = driveId ? `/ai/students/me/drives/${encodeURIComponent(driveId)}/match` : '/ai/students/me/career'
  return apiRequest(`${base}/assessment`, { method: 'POST', signal, headers: { Authorization: `Bearer ${token}` }, body: {} })
}
