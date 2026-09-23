import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { healthRouter } from './modules/health/health.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { adminStudentRouter, studentRouter } from './modules/students/student.routes.js'
import { adminCompanyRouter, companyRouter } from './modules/companies/company.routes.js'
import { institutionRouter } from './modules/institution/institution.routes.js'
import { adminStudentPolicyRouter, studentPolicyRouter } from './modules/student-policy/student-policy.routes.js'
import { adminRecruiterPolicyRouter, recruiterPolicyRouter } from './modules/recruiter-policy/recruiter-policy.routes.js'
import { adminPlacementDriveRouter, companyPlacementDriveRouter } from './modules/placement-drives/placement-drive.routes.js'

export const app = express()

app.use(cors({ origin: env.CLIENT_URL }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/v1/health', healthRouter)
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/students', studentRouter)
app.use('/api/v1/admin/students', adminStudentRouter)
app.use('/api/v1/companies', companyRouter)
app.use('/api/v1/admin/companies', adminCompanyRouter)
app.use('/api/v1/admin/institution', institutionRouter)
app.use('/api/v1/students', studentPolicyRouter)
app.use('/api/v1/admin/student-policy', adminStudentPolicyRouter)
app.use('/api/v1/companies', recruiterPolicyRouter)
app.use('/api/v1/admin/recruiter-policy', adminRecruiterPolicyRouter)
app.use('/api/v1/companies', companyPlacementDriveRouter)
app.use('/api/v1/admin/placement-drives', adminPlacementDriveRouter)
app.use(notFound)
app.use(errorHandler)
