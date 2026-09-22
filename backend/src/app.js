import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { healthRouter } from './modules/health/health.routes.js'

export const app = express()

app.use(cors({ origin: env.CLIENT_URL }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/v1/health', healthRouter)
app.use(notFound)
app.use(errorHandler)
