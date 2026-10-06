import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { cancelAdminDrive, closeAdminDriveApplications, completeAdminDrive, createMyPlacementDrive, downloadAdminDriveDocument, downloadMyDriveDocument, extendAdminDriveApplicationDeadline, getAdminDrive, getMyDrive, listAdminDrives, listMyPlacementDriveBranches, listMyDrives, postponeAdminDrive, publishAdminDrive, reopenAdminDriveApplications, resubmitMyDrive, reviewAdminDrive, submitMyDrive, updateMyDrive, uploadMyDriveDocument } from './placement-drive.controller.js'
import { downloadDriveApplicantResume, getDriveApplicant, listDriveApplicants } from '../applications/company-drive-applicant.controller.js'
import { getPublishedDriveMonitoring, listPublishedDriveMonitoring } from '../applications/admin-drive-monitoring.controller.js'
import { placementDriveApplicantParamsSchema, placementDriveApplicationWindowDeadlineSchema, placementDriveApplicationWindowReopenSchema, placementDriveCreateSchema, placementDriveDocumentParamsSchema, placementDriveIdParamsSchema, placementDriveLifecycleReasonSchema, placementDriveReviewSchema, placementDriveUpdateSchema } from './placement-drive.validation.js'
import { bulkRecruitmentTransitionSchema, phaseExecutionUpdateSchema, recruitmentCandidateExportQuerySchema, recruitmentCandidateParamsSchema, recruitmentCandidateQuerySchema, recruitmentDriveParamsSchema, recruitmentPhaseParamsSchema, recruitmentTransitionSchema } from '../recruitment/recruitment-workspace.validation.js'
import { bulkTransitionMyRecruitmentCandidates, downloadMyPhaseInstructionPdf, exportMyRecruitmentCandidates, getMyPhaseCandidateRecipientCount, getMyRecruitmentWorkspace, listMyRecruitmentActivity, listMyRecruitmentCandidates, transitionMyRecruitmentCandidate, updateMyPhaseExecution, uploadMyPhaseInstructionPdf } from '../recruitment/recruitment-workspace.controller.js'
import { exportMyCompanyCandidateExplorer, getMyCompanyAnalytics, getMyCompanyCandidateExplorer } from '../analytics/company-analytics.controller.js'
import { companyCandidateQuerySchema } from '../analytics/company-analytics.validation.js'

const uploadDirectory = path.resolve(env.RESUME_UPLOAD_DIR)
await mkdir(uploadDirectory, { recursive: true })
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDirectory, filename: (_request, _file, callback) => callback(null, `${randomUUID()}.pdf`) }),
  limits: { fileSize: env.RESUME_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf'
    ? callback(null, true)
    : callback(new AppError('Only PDF files are allowed.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })),
})

export const companyPlacementDriveRouter = Router()
companyPlacementDriveRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY))
companyPlacementDriveRouter.post('/me/placement-drives', validateBody(placementDriveCreateSchema), createMyPlacementDrive)
companyPlacementDriveRouter.get('/me/placement-drives/branches', listMyPlacementDriveBranches)
companyPlacementDriveRouter.get('/me/placement-drives', listMyDrives)
companyPlacementDriveRouter.get('/me/analytics', validateQuery(companyCandidateQuerySchema), getMyCompanyAnalytics)
companyPlacementDriveRouter.get('/me/candidates', validateQuery(companyCandidateQuerySchema), getMyCompanyCandidateExplorer)
companyPlacementDriveRouter.get('/me/candidates/export', validateQuery(companyCandidateQuerySchema), exportMyCompanyCandidateExplorer)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment', validateParams(recruitmentDriveParamsSchema), getMyRecruitmentWorkspace)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment/candidates', validateParams(recruitmentDriveParamsSchema), validateQuery(recruitmentCandidateQuerySchema), listMyRecruitmentCandidates)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment/candidates/export', validateParams(recruitmentDriveParamsSchema), validateQuery(recruitmentCandidateExportQuerySchema), exportMyRecruitmentCandidates)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment/activity', validateParams(recruitmentDriveParamsSchema), listMyRecruitmentActivity)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment/phases/:phaseNumber/recipient-count', validateParams(recruitmentPhaseParamsSchema), getMyPhaseCandidateRecipientCount)
companyPlacementDriveRouter.post('/me/placement-drives/:id/recruitment/candidates/bulk-transition', validateParams(recruitmentDriveParamsSchema), validateBody(bulkRecruitmentTransitionSchema), bulkTransitionMyRecruitmentCandidates)
companyPlacementDriveRouter.post('/me/placement-drives/:id/recruitment/candidates/:applicationId/transition', validateParams(recruitmentCandidateParamsSchema), validateBody(recruitmentTransitionSchema), transitionMyRecruitmentCandidate)
companyPlacementDriveRouter.patch('/me/placement-drives/:id/recruitment/phases/:phaseNumber', validateParams(recruitmentPhaseParamsSchema), validateBody(phaseExecutionUpdateSchema), updateMyPhaseExecution)
companyPlacementDriveRouter.post('/me/placement-drives/:id/recruitment/phases/:phaseNumber/instruction-pdf', validateParams(recruitmentPhaseParamsSchema), upload.single('document'), uploadMyPhaseInstructionPdf)
companyPlacementDriveRouter.get('/me/placement-drives/:id/recruitment/phases/:phaseNumber/instruction-pdf/download', validateParams(recruitmentPhaseParamsSchema), downloadMyPhaseInstructionPdf)
companyPlacementDriveRouter.get('/me/placement-drives/:id/applicants', validateParams(placementDriveIdParamsSchema), listDriveApplicants)
companyPlacementDriveRouter.get('/me/placement-drives/:id/applicants/:studentId/resume/download', validateParams(placementDriveApplicantParamsSchema), downloadDriveApplicantResume)
companyPlacementDriveRouter.get('/me/placement-drives/:id/applicants/:studentId', validateParams(placementDriveApplicantParamsSchema), getDriveApplicant)
companyPlacementDriveRouter.get('/me/placement-drives/:id', validateParams(placementDriveIdParamsSchema), getMyDrive)
companyPlacementDriveRouter.patch('/me/placement-drives/:id', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveUpdateSchema), updateMyDrive)
companyPlacementDriveRouter.post('/me/placement-drives/:id/documents/:type', validateParams(placementDriveDocumentParamsSchema), upload.single('document'), uploadMyDriveDocument)
companyPlacementDriveRouter.get('/me/placement-drives/:id/documents/:type/download', validateParams(placementDriveDocumentParamsSchema), downloadMyDriveDocument)
companyPlacementDriveRouter.post('/me/placement-drives/:id/submit', validateParams(placementDriveIdParamsSchema), submitMyDrive)
companyPlacementDriveRouter.post('/me/placement-drives/:id/resubmit', validateParams(placementDriveIdParamsSchema), resubmitMyDrive)

export const adminPlacementDriveRouter = Router()
adminPlacementDriveRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminPlacementDriveRouter.get('/monitoring', listPublishedDriveMonitoring)
adminPlacementDriveRouter.get('/:id/monitoring', validateParams(placementDriveIdParamsSchema), getPublishedDriveMonitoring)
adminPlacementDriveRouter.get('/', listAdminDrives)
adminPlacementDriveRouter.get('/:id', validateParams(placementDriveIdParamsSchema), getAdminDrive)
adminPlacementDriveRouter.get('/:id/documents/:type/download', validateParams(placementDriveDocumentParamsSchema), downloadAdminDriveDocument)
adminPlacementDriveRouter.patch('/:id/review', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveReviewSchema), reviewAdminDrive)
adminPlacementDriveRouter.patch('/:id/publish', validateParams(placementDriveIdParamsSchema), publishAdminDrive)
adminPlacementDriveRouter.patch('/:id/lifecycle/postpone', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveLifecycleReasonSchema), postponeAdminDrive)
adminPlacementDriveRouter.patch('/:id/lifecycle/close', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveLifecycleReasonSchema), completeAdminDrive)
adminPlacementDriveRouter.patch('/:id/lifecycle/cancel', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveLifecycleReasonSchema), cancelAdminDrive)
adminPlacementDriveRouter.patch('/:id/application-window/deadline', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveApplicationWindowDeadlineSchema), extendAdminDriveApplicationDeadline)
adminPlacementDriveRouter.patch('/:id/application-window/close', validateParams(placementDriveIdParamsSchema), closeAdminDriveApplications)
adminPlacementDriveRouter.patch('/:id/application-window/reopen', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveApplicationWindowReopenSchema), reopenAdminDriveApplications)
