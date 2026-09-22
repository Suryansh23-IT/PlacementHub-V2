import { Router } from 'express'
import { validateBody } from '../../middleware/validate-request.js'
import { authenticate } from './auth.middleware.js'
import { authRateLimiter } from './auth-rate-limit.js'
import { getMe, login, register } from './auth.controller.js'
import { loginSchema, registerSchema } from './auth.validation.js'

export const authRouter = Router()

authRouter.post('/register', authRateLimiter, validateBody(registerSchema), register)
authRouter.post('/login', authRateLimiter, validateBody(loginSchema), login)
authRouter.get('/me', authenticate, getMe)
