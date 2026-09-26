import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export const getStudentDashboardSummary = token => apiRequest('/students/me/dashboard-summary', { headers: headers(token) })
export const getCompanyDashboardSummary = token => apiRequest('/companies/me/dashboard-summary', { headers: headers(token) })
export const getAdminDashboardSummary = token => apiRequest('/admin/dashboard-summary', { headers: headers(token) })
