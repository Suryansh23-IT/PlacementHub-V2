import { sendSuccess } from '../../utils/api-response.js'

export function createAiRuntimeControllers(ai) {
  return {
    status: (request, response) => sendSuccess(response, { message: 'AI runtime status.', data: ai.runtimeStatus() }),
    reset: (request, response) => sendSuccess(response, { message: 'AI runtime reset. New AI requests can now be started.', data: ai.resetRuntime() }),
  }
}
