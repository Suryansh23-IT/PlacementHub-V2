import { sendSuccess } from '../../utils/api-response.js'
import { getAdminPublishedDriveMonitoring, listAdminPublishedDriveMonitoring } from './admin-drive-monitoring.service.js'

export async function listPublishedDriveMonitoring(_request, response) {
  return sendSuccess(response, { message: 'Published Placement Drive monitoring retrieved.', data: await listAdminPublishedDriveMonitoring() })
}

export async function getPublishedDriveMonitoring(request, response) {
  return sendSuccess(response, { message: 'Placement Drive monitoring retrieved.', data: await getAdminPublishedDriveMonitoring(request.params.id) })
}
