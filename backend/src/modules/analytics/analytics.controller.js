import { sendSuccess } from '../../utils/api-response.js'
import { getAdminAnalyticsSummary } from './analytics.service.js'
import { getAdminAnalyticsDashboard } from './analytics.service.js'

export async function getAdminAnalyticsSummaryResponse(request, response) {
  return sendSuccess(response, { message: 'Placement analytics summary retrieved.', data: await getAdminAnalyticsSummary(request.validatedQuery) })
}

export async function getAdminAnalyticsDashboardResponse(request, response) {
  return sendSuccess(response, { message: 'Placement command-center analytics retrieved.', data: await getAdminAnalyticsDashboard(request.validatedQuery) })
}
