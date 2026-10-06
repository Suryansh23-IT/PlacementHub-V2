import { sendSuccess } from '../../utils/api-response.js'
import { exportAdminReport, getAdminReportPreview } from './reports.service.js'
export async function getAdminReportPreviewResponse(request, response) { return sendSuccess(response, { message: 'Report preview retrieved.', data: await getAdminReportPreview(request.validatedQuery) }) }
export async function exportAdminReportResponse(request, response) { const exported = await exportAdminReport(request.validatedQuery); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`); return response.send(exported.buffer) }
