import { Router } from 'express'
import { validateParams } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { placementDriveDocumentParamsSchema, placementDriveIdParamsSchema } from '../placement-drives/placement-drive.validation.js'
import { recruitmentDriveParamsSchema } from '../recruitment/recruitment-workspace.validation.js'
import { applyToDrive, downloadMyCurrentPhaseInstructionPdf, downloadStudentDriveDocument, getMyCurrentPhaseExecution, getMyRecruitmentJourney, getStudentDrive, listMyApplications, listStudentDrives, withdrawMyApplication } from './student-placement-drive.controller.js'

export const studentPlacementDriveRouter = Router()
studentPlacementDriveRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT))
studentPlacementDriveRouter.get('/me/placement-drives', listStudentDrives)
studentPlacementDriveRouter.get('/me/applications', listMyApplications)
studentPlacementDriveRouter.get('/me/applications/:id/current-phase', validateParams(recruitmentDriveParamsSchema), getMyCurrentPhaseExecution)
studentPlacementDriveRouter.get('/me/applications/:id/current-phase/instruction-pdf/download', validateParams(recruitmentDriveParamsSchema), downloadMyCurrentPhaseInstructionPdf)
studentPlacementDriveRouter.get('/me/applications/:id/journey', validateParams(recruitmentDriveParamsSchema), getMyRecruitmentJourney)
studentPlacementDriveRouter.post('/me/applications/:id/withdraw', validateParams(placementDriveIdParamsSchema), withdrawMyApplication)
studentPlacementDriveRouter.get('/me/placement-drives/:id/documents/:type/download', validateParams(placementDriveDocumentParamsSchema), downloadStudentDriveDocument)
studentPlacementDriveRouter.post('/me/placement-drives/:id/apply', validateParams(placementDriveIdParamsSchema), applyToDrive)
studentPlacementDriveRouter.get('/me/placement-drives/:id', validateParams(placementDriveIdParamsSchema), getStudentDrive)
