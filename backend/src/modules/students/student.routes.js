import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { validateBody } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { downloadMyResume, getMyProfile, getStudentsForReview, patchMyProfile, patchStudentVerification, resubmitMyProfileForVerification, uploadMyResume } from './student.controller.js'
import { studentProfileSchema, verificationSchema } from './student.validation.js'

const resumeDirectory = path.resolve(env.RESUME_UPLOAD_DIR)
await mkdir(resumeDirectory, { recursive: true })

const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: resumeDirectory,
    filename: (request, file, callback) => callback(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: env.RESUME_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (request, file, callback) => {
    const isPdf = file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf'
    if (!isPdf) return callback(new AppError('Only PDF resume files are allowed.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }))
    return callback(null, true)
  },
})

export const studentRouter = Router()
studentRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT))
studentRouter.get('/me', getMyProfile)
studentRouter.patch('/me', validateBody(studentProfileSchema), patchMyProfile)
studentRouter.post('/me/resume', resumeUpload.single('resume'), uploadMyResume)
studentRouter.get('/me/resume/download', downloadMyResume)
studentRouter.post('/me/verification/resubmit', resubmitMyProfileForVerification)

export const adminStudentRouter = Router()
adminStudentRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminStudentRouter.get('/', getStudentsForReview)
adminStudentRouter.patch('/:id/verification', validateBody(verificationSchema), patchStudentVerification)
