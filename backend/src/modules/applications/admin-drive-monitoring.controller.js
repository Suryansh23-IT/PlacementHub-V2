import { sendSuccess } from '../../utils/api-response.js'
import { getAdminPublishedDriveMonitoring, listAdminPublishedDriveMonitoring } from './admin-drive-monitoring.service.js'
import { PlacementRecord } from '../placements/placement-record.model.js'

export async function listPublishedDriveMonitoring(request, response) {
  const includeClosed = request.query.includeClosed === 'true'
  return sendSuccess(response, { message: 'Placement Drive monitoring retrieved.', data: await listAdminPublishedDriveMonitoring({ includeClosed }) })
}

export async function getPublishedDriveMonitoring(request, response) {
  return sendSuccess(response, { message: 'Placement Drive monitoring retrieved.', data: await getAdminPublishedDriveMonitoring(request.params.id, { placementRecordModel: PlacementRecord }) })
}
