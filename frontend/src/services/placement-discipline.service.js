import { apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })
const base = '/admin/placement-discipline'

export const listAdminIncidentReports = token => apiRequest(`${base}/incidents`, { headers: headers(token) })
export const listAdminPlacementRestrictions = token => apiRequest(`${base}/restrictions`, { headers: headers(token) })
export const listAdminPlacementRestrictionHistory = token => apiRequest(`${base}/restrictions/history`, { headers: headers(token) })
export const reviewAdminIncidentReport = (token, id, body) => apiRequest(`${base}/incidents/${encodeURIComponent(id)}/review`, { method: 'PATCH', headers: headers(token), body })
export const applyAdminRestrictionFromIncident = (token, id, body) => apiRequest(`${base}/incidents/${encodeURIComponent(id)}/restriction`, { method: 'POST', headers: headers(token), body })
export const archiveAdminIncidentReport = (token, id) => apiRequest(`${base}/incidents/${encodeURIComponent(id)}/archive`, { method: 'PATCH', headers: headers(token) })
export const removeAdminPlacementRestriction = (token, id, body) => apiRequest(`${base}/restrictions/${encodeURIComponent(id)}/remove`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(body) })
