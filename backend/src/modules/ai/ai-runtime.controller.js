import { sendSuccess } from '../../utils/api-response.js'
import { semanticAiEnabled } from '../../config/runtime-policy.js'
import { unavailable } from './ai.errors.js'

export function createAiRuntimeControllers(ai, config) {
  return {
    status: (request, response) => sendSuccess(response, { message: 'AI runtime status.', data: semanticAiEnabled(config) ? ai.runtimeStatus() : { status: 'DISABLED', ai: unavailable('disabled') } }),
    reset: (request, response) => sendSuccess(response, { message: semanticAiEnabled(config) ? 'AI runtime reset. New AI requests can now be started.' : 'AI intelligence is disabled.', data: semanticAiEnabled(config) ? ai.resetRuntime() : { status: 'DISABLED', ai: unavailable('disabled') } }),
  }
}
