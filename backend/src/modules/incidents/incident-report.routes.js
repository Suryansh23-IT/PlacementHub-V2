import { Router } from 'express'
import { validateBody, validateParams } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { applyAdminRestrictionFromIncident, archiveAdminIncident, createMyCompanyIncidentReport, listAdminIncidents, listAdminRestrictionHistory, listAdminRestrictions, removeAdminRestriction, reviewAdminIncident } from './incident-report.controller.js'
import { incidentIdParamsSchema, incidentReportCreateSchema, incidentReviewSchema, restrictionIdParamsSchema, restrictionImpositionSchema, restrictionRemovalSchema } from './incident-report.validation.js'

export const companyIncidentRouter = Router()
companyIncidentRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY))
companyIncidentRouter.post('/me/incidents', validateBody(incidentReportCreateSchema), createMyCompanyIncidentReport)

export const adminIncidentRouter = Router()
adminIncidentRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminIncidentRouter.get('/incidents', listAdminIncidents)
adminIncidentRouter.patch('/incidents/:id/review', validateParams(incidentIdParamsSchema), validateBody(incidentReviewSchema), reviewAdminIncident)
adminIncidentRouter.post('/incidents/:id/restriction', validateParams(incidentIdParamsSchema), validateBody(restrictionImpositionSchema), applyAdminRestrictionFromIncident)
adminIncidentRouter.patch('/incidents/:id/archive', validateParams(incidentIdParamsSchema), archiveAdminIncident)
adminIncidentRouter.get('/restrictions', listAdminRestrictions)
adminIncidentRouter.get('/restrictions/history', listAdminRestrictionHistory)
adminIncidentRouter.patch('/restrictions/:id/remove', validateParams(restrictionIdParamsSchema), validateBody(restrictionRemovalSchema), removeAdminRestriction)
