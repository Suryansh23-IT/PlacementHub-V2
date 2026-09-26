import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export const listCompanyNotifications = token => apiRequest('/companies/me/notifications', { headers: headers(token) })
export const listCompanySentNotifications = token => apiRequest('/companies/me/notifications/sent', { headers: headers(token) })
export const markCompanyNotificationRead = (token, id) => apiRequest(`/companies/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers(token) })
export const sendCompanyAdminNotification = (token, body) => apiRequest('/companies/me/notifications/admin', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const sendCompanyDriveApplicantsNotification = (token, body) => apiRequest('/companies/me/notifications/drive-applicants', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
