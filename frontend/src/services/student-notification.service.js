import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export const listStudentNotifications = token => apiRequest('/students/me/notifications', { headers: headers(token) })
export const markStudentNotificationRead = (token, id) => apiRequest(`/students/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers(token) })
