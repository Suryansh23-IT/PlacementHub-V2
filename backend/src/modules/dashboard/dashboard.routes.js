import { Router } from 'express'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { getAdminDashboardSummaryResponse, getMyCompanyDashboardSummary, getMyStudentDashboardSummary } from './dashboard.controller.js'
export const studentDashboardRouter = Router(); studentDashboardRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT)); studentDashboardRouter.get('/me/dashboard-summary', getMyStudentDashboardSummary)
export const companyDashboardRouter = Router(); companyDashboardRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY)); companyDashboardRouter.get('/me/dashboard-summary', getMyCompanyDashboardSummary)
export const adminDashboardRouter = Router(); adminDashboardRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN)); adminDashboardRouter.get('/dashboard-summary', getAdminDashboardSummaryResponse)
