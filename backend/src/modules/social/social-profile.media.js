import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
// Profile forms have more plain-text fields than Feed forms. Storage/signature
// validation still uses the existing safe social media helpers.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.SOCIAL_IMAGE_MAX_BYTES, files: 1, fields: 30 }, fileFilter: (request, file, next) => ['image/jpeg','image/png','image/webp'].includes(file.mimetype) ? next(null,true) : next(new AppError('Use a JPEG, PNG, or WebP image.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })) }).single('image')
export function profileImageUpload(request,response,next) {
  upload(request,response,error => next(error instanceof multer.MulterError ? new AppError(error.code === 'LIMIT_FILE_SIZE' ? 'Profile image exceeds the upload size limit.' : 'Upload one image with a valid Social Profile form.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }) : error))
}
