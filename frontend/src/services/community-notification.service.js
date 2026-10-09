import { apiRequest } from './api-client.js'
const headers = token => ({ Authorization: `Bearer ${token}` })
export const listCommunityNotifications = (token, filters = {}) => apiRequest(`/social/notifications?${new URLSearchParams({ page: 1, limit: 25, state: 'all', category: 'all', ...filters })}`, { headers: headers(token) })
export const markCommunityNotificationRead = (token, id) => apiRequest(`/social/notifications/${id}/read`, { method: 'PATCH', headers: headers(token) })
export const markCommunityNotificationsRead = token => apiRequest('/social/notifications/read-all', { method: 'PATCH', headers: headers(token) })
