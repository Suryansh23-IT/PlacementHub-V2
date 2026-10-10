import { sendSuccess } from '../../utils/api-response.js'
import { getAiStatus } from './ai.service.js'

export function createAiStatusController(config) {
  return (request, response) => sendSuccess(response, { message: 'AI foundation status.', data: getAiStatus(config) })
}
