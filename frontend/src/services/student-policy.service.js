import { apiRequest } from './api-client.js'
const bearer = (accessToken) => ({ Authorization: `Bearer ${accessToken}` })
export const getMyStudentPolicy = (accessToken) => apiRequest('/students/me/policy', { headers: bearer(accessToken) })
export const acceptMyStudentPolicy = (accessToken) => apiRequest('/students/me/policy/accept', { method: 'POST', headers: bearer(accessToken) })
export const getAdminStudentPolicy = (accessToken) => apiRequest('/admin/student-policy', { headers: bearer(accessToken) })
export const saveAdminStudentPolicy = (accessToken, body) => apiRequest('/admin/student-policy', { method: 'PUT', headers: bearer(accessToken), body: JSON.stringify(body) })
