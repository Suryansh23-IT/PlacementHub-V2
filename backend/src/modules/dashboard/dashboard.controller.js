import { sendSuccess } from '../../utils/api-response.js'
import { getAdminDashboardSummary, getCompanyDashboardSummary, getStudentDashboardSummary } from './dashboard.service.js'
export async function getMyStudentDashboardSummary(request, response) { return sendSuccess(response, { message: 'Dashboard summary retrieved.', data: await getStudentDashboardSummary(request.user._id) }) }
export async function getMyCompanyDashboardSummary(request, response) { return sendSuccess(response, { message: 'Dashboard summary retrieved.', data: await getCompanyDashboardSummary(request.user._id) }) }
export async function getAdminDashboardSummaryResponse(request, response) { return sendSuccess(response, { message: 'Dashboard summary retrieved.', data: await getAdminDashboardSummary(request.user._id) }) }
