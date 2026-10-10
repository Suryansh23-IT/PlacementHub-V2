import { sendSuccess } from '../../utils/api-response.js'
import { env } from '../../config/env.js'
import { isAiRuntime } from '../ai/ai.guard.js'
import { exportCompanyCandidateExplorer, getCompanyAnalytics, getCompanyCandidateExplorer } from './company-analytics.service.js'
export async function getMyCompanyAnalytics(request, response) { return sendSuccess(response, { message: 'Company analytics retrieved.', data: await getCompanyAnalytics(request.user._id, request.validatedQuery ?? {}) }) }
export async function getMyCompanyCandidateExplorer(request, response) { return sendSuccess(response, { message: 'Candidates retrieved.', data: await getCompanyCandidateExplorer(request.user._id, request.validatedQuery, { objectiveMatching: isAiRuntime(env) }) }) }
export async function exportMyCompanyCandidateExplorer(request, response) { const exported = await exportCompanyCandidateExplorer(request.user._id, request.validatedQuery, { objectiveMatching: isAiRuntime(env) }); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`); return response.send(exported.buffer) }
