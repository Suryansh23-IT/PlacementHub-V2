import { Router } from 'express'
import { validateParams, validateQuery } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { listAdminNotifications, listAdminSentNotificationPage, listAdminSentNotifications, listCompanyNotifications, listCompanySentNotificationPage, listCompanySentNotifications, listMyNotificationPage, listMyNotifications, markAdminNotificationRead, markCompanyNotificationRead, markMyNotificationRead, markMyNotificationsRead, previewCompanyCandidates, previewExplorerStudentsNotification, sendAdminNotification, sendCompanyCandidates, sendCompanyNotification, sendDriveApplicantsNotification, sendExplorerStudentsNotification, sendPhaseCandidatesNotification, sendStudentsNotification } from './notification.controller.js'
import { adminCompanyNotificationParamsSchema, adminCompanyNotificationSchema, adminStudentNotificationSchema, companyAdminNotificationSchema, companyDriveApplicantsNotificationSchema, companyPhaseCandidatesNotificationSchema, companyTargetSchema, explorerTargetSchema, notificationIdParamsSchema, notificationListQuerySchema } from './notification.validation.js'
import { validateBody } from '../../middleware/validate-request.js'

export const studentNotificationRouter = Router()
studentNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT))
studentNotificationRouter.get('/me/notifications', listMyNotifications)
studentNotificationRouter.get('/me/notifications/page', validateQuery(notificationListQuerySchema), listMyNotificationPage)
studentNotificationRouter.patch('/me/notifications/:id/read', validateParams(notificationIdParamsSchema), markMyNotificationRead)
studentNotificationRouter.patch('/me/notifications/read-all', markMyNotificationsRead)

export const adminNotificationRouter = Router()
adminNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminNotificationRouter.get('/', listAdminNotifications)
adminNotificationRouter.get('/sent', listAdminSentNotifications)
adminNotificationRouter.get('/sent/page', validateQuery(notificationListQuerySchema), listAdminSentNotificationPage)
adminNotificationRouter.patch('/:id/read', validateParams(notificationIdParamsSchema), markAdminNotificationRead)
adminNotificationRouter.post('/students', validateBody(adminStudentNotificationSchema), sendStudentsNotification)
adminNotificationRouter.post('/students/preview', validateBody(explorerTargetSchema), previewExplorerStudentsNotification)
adminNotificationRouter.post('/students/explorer', validateBody(explorerTargetSchema), sendExplorerStudentsNotification)
adminNotificationRouter.post('/companies/:companyUserId', validateParams(adminCompanyNotificationParamsSchema), validateBody(adminCompanyNotificationSchema), sendCompanyNotification)

export const companyNotificationRouter = Router()
companyNotificationRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY))
companyNotificationRouter.get('/me/notifications', listCompanyNotifications)
companyNotificationRouter.get('/me/notifications/sent', listCompanySentNotifications)
companyNotificationRouter.get('/me/notifications/sent/page', validateQuery(notificationListQuerySchema), listCompanySentNotificationPage)
companyNotificationRouter.patch('/me/notifications/:id/read', validateParams(notificationIdParamsSchema), markCompanyNotificationRead)
companyNotificationRouter.post('/me/notifications/admin', validateBody(companyAdminNotificationSchema), sendAdminNotification)
companyNotificationRouter.post('/me/notifications/drive-applicants', validateBody(companyDriveApplicantsNotificationSchema), sendDriveApplicantsNotification)
companyNotificationRouter.post('/me/notifications/phase-candidates', validateBody(companyPhaseCandidatesNotificationSchema), sendPhaseCandidatesNotification)
companyNotificationRouter.post('/me/notifications/candidates/preview', validateBody(companyTargetSchema), previewCompanyCandidates)
companyNotificationRouter.post('/me/notifications/candidates', validateBody(companyTargetSchema), sendCompanyCandidates)
