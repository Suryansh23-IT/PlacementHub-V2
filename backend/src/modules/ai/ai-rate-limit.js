import { rateLimit } from 'express-rate-limit'
import { sendError } from '../../utils/api-response.js'

export function createAiRateLimiter(config) {
  return rateLimit({
    windowMs: config.AI_RATE_LIMIT_WINDOW_MS,
    limit: config.AI_RATE_LIMIT_MAX,
    keyGenerator: request => String(request.user._id),
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (request, response) => sendError(response, { statusCode: 429, errorCode: 'RATE_LIMITED', message: 'Too many AI requests. Please try again later.' }),
  })
}
