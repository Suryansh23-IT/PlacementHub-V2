import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { healthRouter } from './modules/health/health.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { adminStudentRouter, studentRouter } from './modules/students/student.routes.js'

export const app = express()

app.use(cors({ origin: env.CLIENT_URL }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/v1/health', healthRouter)
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/students', studentRouter)
app.use('/api/v1/admin/students', adminStudentRouter)
app.use(notFound)
app.use(errorHandler)
