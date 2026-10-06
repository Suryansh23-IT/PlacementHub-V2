import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export const listAdminNotifications = token => apiRequest('/admin/notifications', { headers: headers(token) })
export const listAdminSentNotifications = token => apiRequest('/admin/notifications/sent', { headers: headers(token) })
export const markAdminNotificationRead = (token, id) => apiRequest(`/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers(token) })
export const sendAdminStudentNotification = (token, body) => apiRequest('/admin/notifications/students', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const sendAdminCompanyNotification = (token, companyUserId, body) => apiRequest(`/admin/notifications/companies/${encodeURIComponent(companyUserId)}`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const previewAdminExplorerNotification = (token, body) => apiRequest('/admin/notifications/students/preview', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const sendAdminExplorerNotification = (token, body) => apiRequest('/admin/notifications/students/explorer', { method: 'POST', headers: headers(token), body: JSON.stringify(body) })
export const listAdminSentNotificationPage = (token, filters = {}) => apiRequest(`/admin/notifications/sent/page?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`, { headers: headers(token) })
