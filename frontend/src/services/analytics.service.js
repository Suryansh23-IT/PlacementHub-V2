import { API_URL, apiRequest } from './api-client.js'

const headers = token => ({ Authorization: `Bearer ${token}` })

export function getAdminAnalyticsSummary(token, filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : String(value)]))
  return apiRequest(`/admin/analytics/summary${query.size ? `?${query}` : ''}`, { headers: headers(token) })
}

export function getAdminAnalyticsDashboard(token, filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : String(value)]))
  return apiRequest(`/admin/analytics/dashboard${query.size ? `?${query}` : ''}`, { headers: headers(token) })
}
export function getAdminReportPreview(token, filters = {}) { return apiRequest(`/admin/analytics/reports/preview?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null))}`, { headers: headers(token) }) }
export async function exportAdminReport(token, filters = {}) { const response = await fetch(`${API_URL}/admin/analytics/reports/export?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null))}`, { headers: headers(token) }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Report export could not be generated.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/i)?.[1] ?? 'placement-report.xlsx'; anchor.click(); URL.revokeObjectURL(url) }
