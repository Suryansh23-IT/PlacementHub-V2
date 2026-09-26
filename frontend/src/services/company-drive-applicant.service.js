import { API_URL, apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })
const applicantPath = (driveId, studentId) => `/companies/me/placement-drives/${encodeURIComponent(driveId)}/applicants/${encodeURIComponent(studentId)}`

export const listCompanyDriveApplicants = (token, driveId) => apiRequest(`/companies/me/placement-drives/${encodeURIComponent(driveId)}/applicants`, { headers: headers(token) })
export const getCompanyDriveApplicant = (token, driveId, studentId) => apiRequest(applicantPath(driveId, studentId), { headers: headers(token) })
export const createCompanyIncidentReport = (token, body) => apiRequest('/companies/me/incidents', { method: 'POST', headers: headers(token), body })

export async function downloadCompanyDriveApplicantResume(token, driveId, studentId) {
  const response = await fetch(`${API_URL}${applicantPath(driveId, studentId)}/resume/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The applicant resume could not be downloaded.')
  return response.blob()
}
