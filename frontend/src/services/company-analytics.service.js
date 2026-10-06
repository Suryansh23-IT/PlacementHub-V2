import { API_URL, apiRequest } from './api-client.js'
const headers = token => ({ Authorization: `Bearer ${token}` })
const query = filters => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null))
export const getCompanyAnalytics = (token, filters = {}) => apiRequest(`/companies/me/analytics?${query(filters)}`, { headers: headers(token) })
export const getCompanyCandidates = (token, filters = {}) => apiRequest(`/companies/me/candidates?${query(filters)}`, { headers: headers(token) })
export async function exportCompanyCandidates(token, filters = {}) { const response = await fetch(`${API_URL}/companies/me/candidates/export?${query(filters)}`, { headers: headers(token) }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Candidate export could not be generated.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/i)?.[1] ?? 'company-candidates.xlsx'; anchor.click(); URL.revokeObjectURL(url) }
