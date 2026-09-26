import { sendSuccess } from '../../utils/api-response.js'
import { applyRestrictionFromIncident, archiveIncidentReport, createCompanyIncidentReport, listActivePlacementRestrictions, listAdminIncidentReports, listPlacementRestrictionHistory, removeAdminPlacementRestriction, reviewIncidentReport } from './incident-report.service.js'

export async function createMyCompanyIncidentReport(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Incident report sent to Placement Administration.', data: await createCompanyIncidentReport(request.user._id, request.body) }) }
export async function listAdminIncidents(request, response) { return sendSuccess(response, { message: 'Incident reports retrieved.', data: await listAdminIncidentReports() }) }
export async function reviewAdminIncident(request, response) { return sendSuccess(response, { message: 'Incident report reviewed.', data: await reviewIncidentReport(request.user._id, request.params.id, request.body) }) }
export async function applyAdminRestrictionFromIncident(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Placement restriction applied.', data: await applyRestrictionFromIncident(request.user._id, request.params.id, request.body) }) }
export async function archiveAdminIncident(request, response) { return sendSuccess(response, { message: 'Resolved matter closed.', data: await archiveIncidentReport(request.user._id, request.params.id) }) }
export async function listAdminRestrictions(request, response) { return sendSuccess(response, { message: 'Active Placement restrictions retrieved.', data: await listActivePlacementRestrictions() }) }
export async function listAdminRestrictionHistory(request, response) { return sendSuccess(response, { message: 'Placement restriction history retrieved.', data: await listPlacementRestrictionHistory() }) }
export async function removeAdminRestriction(request, response) { return sendSuccess(response, { message: 'Placement restriction removed.', data: await removeAdminPlacementRestriction(request.user._id, request.params.id, request.body.removalReason) }) }
