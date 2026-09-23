import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { validateBody, validateParams } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { createMyPlacementDrive, downloadAdminDriveDocument, downloadMyDriveDocument, getAdminDrive, getMyDrive, listAdminDrives, listMyPlacementDriveBranches, listMyDrives, resubmitMyDrive, reviewAdminDrive, submitMyDrive, updateMyDrive, uploadMyDriveDocument } from './placement-drive.controller.js'
import { placementDriveCreateSchema, placementDriveDocumentParamsSchema, placementDriveIdParamsSchema, placementDriveReviewSchema, placementDriveUpdateSchema } from './placement-drive.validation.js'

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
companyPlacementDriveRouter.get('/me/placement-drives/:id', validateParams(placementDriveIdParamsSchema), getMyDrive)
companyPlacementDriveRouter.patch('/me/placement-drives/:id', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveUpdateSchema), updateMyDrive)
companyPlacementDriveRouter.post('/me/placement-drives/:id/documents/:type', validateParams(placementDriveDocumentParamsSchema), upload.single('document'), uploadMyDriveDocument)
companyPlacementDriveRouter.get('/me/placement-drives/:id/documents/:type/download', validateParams(placementDriveDocumentParamsSchema), downloadMyDriveDocument)
companyPlacementDriveRouter.post('/me/placement-drives/:id/submit', validateParams(placementDriveIdParamsSchema), submitMyDrive)
companyPlacementDriveRouter.post('/me/placement-drives/:id/resubmit', validateParams(placementDriveIdParamsSchema), resubmitMyDrive)

export const adminPlacementDriveRouter = Router()
adminPlacementDriveRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminPlacementDriveRouter.get('/', listAdminDrives)
adminPlacementDriveRouter.get('/:id', validateParams(placementDriveIdParamsSchema), getAdminDrive)
adminPlacementDriveRouter.get('/:id/documents/:type/download', validateParams(placementDriveDocumentParamsSchema), downloadAdminDriveDocument)
adminPlacementDriveRouter.patch('/:id/review', validateParams(placementDriveIdParamsSchema), validateBody(placementDriveReviewSchema), reviewAdminDrive)
