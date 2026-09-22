import { ZodError } from 'zod'
import multer from 'multer'
import { sendError } from '../utils/api-response.js'

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error)
  }

  if (error instanceof ZodError) {
    return sendError(response, {
      statusCode: 422,
      message: 'Request validation failed.',
      errorCode: 'VALIDATION_ERROR',
      details: error.flatten(),
    })
  }

  if (error instanceof multer.MulterError) {
    return sendError(response, {
      statusCode: 422,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Resume files must be 5 MB or smaller.' : 'Resume upload could not be processed.',
      errorCode: 'VALIDATION_ERROR',
    })
  }

  const statusCode = error.statusCode ?? 500
  if (statusCode >= 500) {
    console.error(error)
  }

  return sendError(response, {
    statusCode,
    message: statusCode >= 500 ? 'An unexpected error occurred.' : error.message,
    errorCode: error.errorCode ?? 'INTERNAL_SERVER_ERROR',
    ...(error.details ? { details: error.details } : {}),
  })
}
