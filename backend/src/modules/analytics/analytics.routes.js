import { Router } from 'express'
import { validateQuery } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { getAdminAnalyticsDashboardResponse, getAdminAnalyticsSummaryResponse } from './analytics.controller.js'
import { analyticsFilterSchema } from './analytics.validation.js'
import { exportAdminReportResponse, getAdminReportPreviewResponse } from './reports.controller.js'
import { adminReportQuerySchema } from './reports.validation.js'

export const adminAnalyticsRouter = Router()
adminAnalyticsRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminAnalyticsRouter.get('/summary', validateQuery(analyticsFilterSchema), getAdminAnalyticsSummaryResponse)
adminAnalyticsRouter.get('/dashboard', validateQuery(analyticsFilterSchema), getAdminAnalyticsDashboardResponse)
adminAnalyticsRouter.get('/reports/preview', validateQuery(adminReportQuerySchema), getAdminReportPreviewResponse)
adminAnalyticsRouter.get('/reports/export', validateQuery(adminReportQuerySchema), exportAdminReportResponse)
