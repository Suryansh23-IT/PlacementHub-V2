import { Router } from 'express'
import { validateParams } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { listAdminNotifications, listAdminSentNotifications, listCompanyNotifications, listCompanySentNotifications, listMyNotifications, markAdminNotificationRead, markCompanyNotificationRead, markMyNotificationRead, sendAdminNotification, sendCompanyNotification, sendDriveApplicantsNotification, sendPhaseCandidatesNotification, sendStudentsNotification } from './notification.controller.js'
import { adminCompanyNotificationParamsSchema, adminCompanyNotificationSchema, adminStudentNotificationSchema, companyAdminNotificationSchema, companyDriveApplicantsNotificationSchema, companyPhaseCandidatesNotificationSchema, notificationIdParamsSchema } from './notification.validation.js'
import { validateBody } from '../../middleware/validate-request.js'

export const studentNotificationRouter = Router()
studentNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT))
studentNotificationRouter.get('/me/notifications', listMyNotifications)
studentNotificationRouter.patch('/me/notifications/:id/read', validateParams(notificationIdParamsSchema), markMyNotificationRead)

export const adminNotificationRouter = Router()
adminNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminNotificationRouter.get('/', listAdminNotifications)
adminNotificationRouter.get('/sent', listAdminSentNotifications)
adminNotificationRouter.patch('/:id/read', validateParams(notificationIdParamsSchema), markAdminNotificationRead)
adminNotificationRouter.post('/students', validateBody(adminStudentNotificationSchema), sendStudentsNotification)
adminNotificationRouter.post('/companies/:companyUserId', validateParams(adminCompanyNotificationParamsSchema), validateBody(adminCompanyNotificationSchema), sendCompanyNotification)

export const companyNotificationRouter = Router()
companyNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY))
companyNotificationRouter.get('/me/notifications', listCompanyNotifications)
companyNotificationRouter.get('/me/notifications/sent', listCompanySentNotifications)
companyNotificationRouter.patch('/me/notifications/:id/read', validateParams(notificationIdParamsSchema), markCompanyNotificationRead)
companyNotificationRouter.post('/me/notifications/admin', validateBody(companyAdminNotificationSchema), sendAdminNotification)
companyNotificationRouter.post('/me/notifications/drive-applicants', validateBody(companyDriveApplicantsNotificationSchema), sendDriveApplicantsNotification)
companyNotificationRouter.post('/me/notifications/phase-candidates', validateBody(companyPhaseCandidatesNotificationSchema), sendPhaseCandidatesNotification)
