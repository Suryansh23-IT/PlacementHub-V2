import { rateLimit } from 'express-rate-limit'
import { env } from '../../config/env.js'
import { sendError } from '../../utils/api-response.js'

export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) => sendError(response, {
    statusCode: 429,
    message: 'Too many authentication attempts. Please try again later.',
    errorCode: 'RATE_LIMITED',
  }),
})
