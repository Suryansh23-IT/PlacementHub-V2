import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export const listStudentNotifications = token => apiRequest('/students/me/notifications', { headers: headers(token) })
export const listStudentNotificationPage = (token, filters = {}) => apiRequest(`/students/me/notifications/page?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== 'all'))}`, { headers: headers(token) })
export const markStudentNotificationRead = (token, id) => apiRequest(`/students/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers(token) })
export const markAllStudentNotificationsRead = token => apiRequest('/students/me/notifications/read-all', { method: 'PATCH', headers: headers(token) })
